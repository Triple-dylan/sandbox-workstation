import { useRef, useState } from 'react';
import {
  FileText,
  Folder,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Lock,
  PanelLeftClose,
  Sparkles,
  Users,
} from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from './workspace.tsx';
import { addImage, boardSpot } from '../features/canvas/Canvas.tsx';
import type { Conversation, Resource, Space, User } from '../../shared/types.ts';

type Form = 'document' | 'folder' | 'channel' | 'project' | 'agent' | null;

/** Everything that can be made, in one place beside the rail. It never opens over work. */
export function CreateSheet() {
  const { s, space, setUi, run, notify, openConversation } = useWorkspace();
  const [form, setForm] = useState<Form>(null);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [shared, setShared] = useState(space.kind === 'project');
  const picker = useRef<HTMLInputElement>(null);
  const project = space.kind === 'project';
  const close = () => setUi({ create: false });
  const open = (next: Form) => {
    setForm(form === next ? null : next);
    setName('');
    setPurpose('');
  };
  const submit = async () => {
    const value = name.trim();
    if (!value) return;
    if (form === 'document') {
      const placement = boardSpot(s, space.id, { width: 288, height: 120 });
      const doc = await run(() =>
        api<Resource>('/resources', {
          body: { spaceId: space.id, kind: 'doc', title: value, body: `# ${value}\n\n`, placement },
        }),
      );
      if (doc)
        setUi({
          create: false,
          surface: 'canvas',
          readerId: doc.id,
          selectedId: doc.id,
          wide: true,
        });
    } else if (form === 'folder') {
      const made = await run(() => api('/folders', { body: { spaceId: space.id, title: value } }));
      if (made) {
        notify(`Folder “${value}” added. It is on the graph.`);
        setUi({ create: false, surface: 'graph' });
      }
    } else if (form === 'channel') {
      const made = await run(() =>
        api<Conversation>('/channels', { body: { spaceId: space.id, title: value } }),
      );
      if (made) {
        close();
        openConversation(made.id);
      }
    } else if (form === 'project') {
      const made = await run(() => api<Space>('/projects', { body: { name: value } }));
      if (made)
        setUi({
          create: false,
          spaceId: made.id,
          conversationId: null,
          readerId: null,
          selectedId: null,
        });
    } else if (form === 'agent') {
      const made = await run(() =>
        api<User>('/agents', {
          body: { name: value, purpose, spaceId: project && shared ? space.id : null },
        }),
      );
      if (made) setUi({ create: false, agentId: made.id, readerId: null });
    }
  };
  const plan = async () => {
    const placement = boardSpot(s, space.id, { width: 408, height: 312 });
    const made = await run(() =>
      api('/resources', { body: { spaceId: space.id, kind: 'plan', body: '', placement } }),
    );
    if (made) setUi({ create: false, surface: 'canvas' });
  };
  const Row = ({
    id,
    icon,
    label,
    detail,
    onClick,
  }: {
    id?: Form;
    icon: React.ReactNode;
    label: string;
    detail: string;
    onClick?: () => void;
  }) => (
    <button
      className={`create-row ${id && form === id ? 'active' : ''}`}
      aria-expanded={id ? form === id : undefined}
      onClick={onClick ?? (() => open(id!))}
    >
      {icon}
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
  const nameField = (placeholder: string) => (
    <form
      className="create-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <input
        autoFocus
        value={name}
        maxLength={80}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setForm(null)}
      />
      {form === 'agent' && (
        <>
          <input
            value={purpose}
            maxLength={300}
            placeholder="What it is for"
            aria-label="What it is for"
            onChange={(e) => setPurpose(e.target.value)}
          />
          {project && (
            <div className="create-scope" role="radiogroup" aria-label="Who can use it">
              <button
                type="button"
                role="radio"
                aria-checked={shared}
                onClick={() => setShared(true)}
              >
                <Users size={13} /> Shared with {space.name}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!shared}
                onClick={() => setShared(false)}
              >
                <Lock size={13} /> Private to you
              </button>
            </div>
          )}
        </>
      )}
      <button className="primary" type="submit" disabled={!name.trim()}>
        Create
      </button>
    </form>
  );
  return (
    <div className="sheet create-sheet" aria-label="Create">
      <header>
        <h2>Create</h2>
        <button aria-label="Close" onClick={close}>
          <PanelLeftClose size={16} />
        </button>
      </header>
      <div className="rail-scroll">
        <section>
          <h3>On this board</h3>
          <Row
            id="document"
            icon={<FileText size={16} />}
            label="Document"
            detail="A page you can write and share"
          />
          {form === 'document' && nameField('Document title')}
          <Row
            icon={<ImageIcon size={16} />}
            label="Image"
            detail="Or paste or drop one onto the board"
            onClick={() => picker.current?.click()}
          />
          <input
            ref={picker}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              void run(() => addImage(s, space.id, file)).then(
                (made) => made && setUi({ create: false, surface: 'canvas' }),
              );
            }}
          />
          <Row
            icon={<ListChecks size={16} />}
            label="Plan"
            detail="Steps in order, with an owner, an agent and a date"
            onClick={() => void plan()}
          />
        </section>
        <section>
          <h3>In {space.name}</h3>
          <Row
            id="folder"
            icon={<Folder size={16} />}
            label="Folder"
            detail="A place on the graph"
          />
          {form === 'folder' && nameField('Folder name')}
          {project && (
            <>
              <Row
                id="channel"
                icon={<Hash size={16} />}
                label="Channel"
                detail="A conversation for everyone here"
              />
              {form === 'channel' && nameField('channel-name')}
            </>
          )}
          <Row
            id="agent"
            icon={<Sparkles size={16} />}
            label="Agent"
            detail={project ? 'Shared with the project, or private to you' : 'Private to you'}
          />
          {form === 'agent' && nameField('Agent name')}
        </section>
        <section>
          <h3>New space</h3>
          <Row
            id="project"
            icon={<Users size={16} />}
            label="Project"
            detail="A shared workspace with its own agent"
          />
          {form === 'project' && nameField('Project name')}
        </section>
      </div>
    </div>
  );
}
