// @ts-nocheck
// Stand-ins for libraries only the hosted server uses. The in-page build has no Google sign-in and
// no shared browser service, so these are never reached; if one is, it says so plainly.
const unavailable = (what: string) => () => {
  throw new Error(`${what} is not available in the single-page preview.`);
};

export class OAuth2Client {
  verifyIdToken = unavailable('Google sign-in');
}

export const chromium = { connect: unavailable('The shared browser') };

export class BlockList {
  addSubnet() {}
  addAddress() {}
  check() {
    return true;
  }
}
export const isIP = () => 0;
export const lookup = unavailable('Address lookup');
export default {};
