import { colIndex, colName } from '../../shared/formula.ts';

export type Tokens = { account: string; access: string; refresh: string | null; expiresAt: number };
export type Edit = { row: number; col: number; value: string };
type Fetch = typeof fetch;

/**
 * One place spreadsheets live outside the app. Each person signs in to it once; a linked sheet
 * reads and writes through the sign-in of the person who linked it.
 */
export interface Provider {
  id: 'google' | 'microsoft';
  name: string;
  /** Set up on this server: its app keys are in the environment. */
  ready: boolean;
  /** Whether this link points at one of this provider's spreadsheets. */
  owns(url: string): boolean;
  authUrl(state: string, redirect: string): string;
  exchange(code: string, redirect: string): Promise<Tokens>;
  refresh(refresh: string): Promise<Tokens>;
  open(
    token: string,
    url: string,
  ): Promise<{ fileId: string; title: string; tabs: string[]; url: string }>;
  read(
    token: string,
    fileId: string,
    tab: string,
  ): Promise<{ formulas: string[][]; values: string[][] }>;
  write(token: string, fileId: string, tab: string, edits: Edit[]): Promise<void>;
}

const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const grid = (values: unknown[][] | undefined, top = 0, left = 0) => {
  const out: string[][] = Array.from({ length: top }, () => []);
  for (const row of values ?? [])
    out.push([...Array.from({ length: left }, () => ''), ...row.map(cell)]);
  return out;
};
const accountFromIdToken = (idToken: unknown) => {
  try {
    const payload = JSON.parse(
      Buffer.from(String(idToken).split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
    return String(payload.email ?? payload.preferred_username ?? '');
  } catch {
    return '';
  }
};

async function call(f: Fetch, url: string, token: string, init: RequestInit = {}) {
  const res = await f(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const error = new Error(
      res.status === 401
        ? 'signed-out'
        : res.status === 403 || res.status === 404
          ? 'That spreadsheet is not shared with the account you connected.'
          : `The spreadsheet service answered ${res.status}. ${detail.slice(0, 160)}`,
    );
    (error as Error & { status: number }).status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

async function tokenCall(f: Fetch, url: string, form: Record<string, string>): Promise<Tokens> {
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof data.access_token !== 'string')
    throw new Error(String(data.error_description ?? data.error ?? 'Sign-in did not finish.'));
  return {
    account: accountFromIdToken(data.id_token),
    access: data.access_token,
    refresh: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
  };
}

export function googleSheets(env: NodeJS.ProcessEnv, f: Fetch = fetch): Provider {
  const id = env.GOOGLE_CLIENT_ID?.trim() ?? '';
  const secret = env.GOOGLE_CLIENT_SECRET?.trim() ?? '';
  const api = 'https://sheets.googleapis.com/v4/spreadsheets';
  const range = (tab: string, ref = '') =>
    encodeURIComponent(`'${tab.replace(/'/g, "''")}'${ref ? `!${ref}` : ''}`);
  return {
    id: 'google',
    name: 'Google Sheets',
    ready: !!id && !!secret,
    owns: (url) => /docs\.google\.com\/spreadsheets\/d\//.test(url),
    authUrl: (state, redirect) =>
      `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: id,
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email https://www.googleapis.com/auth/spreadsheets',
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      })}`,
    exchange: (code, redirect) =>
      tokenCall(f, 'https://oauth2.googleapis.com/token', {
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
      }),
    refresh: (refresh) =>
      tokenCall(f, 'https://oauth2.googleapis.com/token', {
        refresh_token: refresh,
        client_id: id,
        client_secret: secret,
        grant_type: 'refresh_token',
      }),
    async open(token, url) {
      const fileId = /\/spreadsheets\/d\/([\w-]+)/.exec(url)?.[1];
      if (!fileId) throw new Error('That is not a Google Sheets link.');
      const data = await call(
        f,
        `${api}/${fileId}?fields=properties.title,sheets.properties.title`,
        token,
      );
      return {
        fileId,
        title: String(data.properties?.title ?? 'Google Sheet'),
        tabs: (data.sheets ?? []).map((s: any) => String(s.properties?.title)),
        url: `https://docs.google.com/spreadsheets/d/${fileId}/edit`,
      };
    },
    async read(token, fileId, tab) {
      const get = (render: string) =>
        call(f, `${api}/${fileId}/values/${range(tab)}?valueRenderOption=${render}`, token);
      const [formulas, values] = await Promise.all([get('FORMULA'), get('FORMATTED_VALUE')]);
      return { formulas: grid(formulas?.values), values: grid(values?.values) };
    },
    async write(token, fileId, tab, edits) {
      await call(f, `${api}/${fileId}/values:batchUpdate`, token, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: edits.map((e) => ({
            range: decodeURIComponent(range(tab, `${colName(e.col)}${e.row + 1}`)),
            values: [[e.value]],
          })),
        }),
      });
    },
  };
}

export function excelOnline(env: NodeJS.ProcessEnv, f: Fetch = fetch): Provider {
  const id = env.MICROSOFT_CLIENT_ID?.trim() ?? '';
  const secret = env.MICROSOFT_CLIENT_SECRET?.trim() ?? '';
  const login = 'https://login.microsoftonline.com/common/oauth2/v2.0';
  const graph = 'https://graph.microsoft.com/v1.0';
  const scope = 'openid email offline_access User.Read Files.ReadWrite';
  const book = (fileId: string) => {
    const [drive, item] = fileId.split('/');
    return `${graph}/drives/${drive}/items/${item}/workbook`;
  };
  const sheet = (fileId: string, tab: string) =>
    `${book(fileId)}/worksheets('${encodeURIComponent(tab.replace(/'/g, "''"))}')`;
  return {
    id: 'microsoft',
    name: 'Excel',
    ready: !!id && !!secret,
    owns: (url) => /(onedrive\.live\.com|1drv\.ms|sharepoint\.com|office\.com)/.test(url),
    authUrl: (state, redirect) =>
      `${login}/authorize?${new URLSearchParams({
        client_id: id,
        redirect_uri: redirect,
        response_type: 'code',
        response_mode: 'query',
        scope,
        state,
      })}`,
    exchange: (code, redirect) =>
      tokenCall(f, `${login}/token`, {
        code,
        client_id: id,
        client_secret: secret,
        redirect_uri: redirect,
        grant_type: 'authorization_code',
        scope,
      }),
    refresh: (refresh) =>
      tokenCall(f, `${login}/token`, {
        refresh_token: refresh,
        client_id: id,
        client_secret: secret,
        grant_type: 'refresh_token',
        scope,
      }),
    async open(token, url) {
      // A sharing link is looked up as a "share": u! and the link in base64url.
      const share = `u!${Buffer.from(url).toString('base64url')}`;
      const item = await call(f, `${graph}/shares/${share}/driveItem`, token);
      const fileId = `${item.parentReference?.driveId}/${item.id}`;
      const sheets = await call(f, `${book(fileId)}/worksheets?$select=name`, token);
      return {
        fileId,
        title: String(item.name ?? 'Workbook').replace(/\.xlsx$/i, ''),
        tabs: (sheets.value ?? []).map((s: any) => String(s.name)),
        url: String(item.webUrl ?? url),
      };
    },
    async read(token, fileId, tab) {
      const used = await call(
        f,
        `${sheet(fileId, tab)}/usedRange(valuesOnly=false)?$select=address,formulas,text`,
        token,
      );
      // The used range may not start at A1.
      const start = /!?\$?([A-Z]+)\$?(\d+)/.exec(
        String(used.address ?? '')
          .split('!')
          .pop() ?? '',
      );
      const top = start ? Number(start[2]) - 1 : 0;
      const left = start ? colIndex(start[1]) : 0;
      return { formulas: grid(used.formulas, top, left), values: grid(used.text, top, left) };
    },
    async write(token, fileId, tab, edits) {
      for (const e of edits)
        await call(
          f,
          `${sheet(fileId, tab)}/range(address='${colName(e.col)}${e.row + 1}')`,
          token,
          { method: 'PATCH', body: JSON.stringify({ formulas: [[e.value]] }) },
        );
    },
  };
}
