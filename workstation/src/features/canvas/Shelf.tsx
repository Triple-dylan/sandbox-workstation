import {
  AlignLeft,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Lock,
  Pin,
} from 'lucide-react';
import { useWorkspace } from '../../app/workspace.tsx';

/** The board folded away beside an open document: everything on it, one line each. */
export function Shelf() {
  const { s, space, ui, setUi } = useWorkspace();
  const items = s.resources.filter(
    (r) => r.spaceId === space.id && r.placement && r.kind !== 'folder',
  );
  const icon = {
    note: <AlignLeft size={14} />,
    doc: <FileText size={14} />,
    pin: <Pin size={14} />,
    image: <ImageIcon size={14} />,
    plan: <ListChecks size={14} />,
    folder: null,
  };
  return (
    <nav className="shelf" aria-label="On the board">
      <button className="shelf-back" onClick={() => setUi({ readerId: null, wide: false })}>
        <ArrowLeft size={14} /> Back to the board
      </button>
      <h3>On the board</h3>
      {items.map((r) => (
        <button
          key={r.id}
          className={`shelf-row ${ui.readerId === r.id ? 'active' : ''}`}
          onClick={() =>
            r.kind === 'doc'
              ? setUi({ readerId: r.id, selectedId: r.id })
              : setUi({ readerId: null, wide: false, selectedId: r.id })
          }
        >
          {icon[r.kind]}
          <span className="truncate">{r.title}</span>
          {r.visibility === 'private' && space.kind === 'project' && <Lock size={11} />}
        </button>
      ))}
    </nav>
  );
}
