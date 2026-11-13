import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Play, Plus, Trash2, X } from 'lucide-react';
import { api } from '../data/client.ts';
import { useWorkspace } from '../app/workspace.tsx';
import { Md, deckSlides } from '../app/util.tsx';
import type { Resource } from '../../shared/types.ts';

/** A deck: a list of slides, each a title and some writing, with a way to present them. */
export function DeckPage({ page }: { page: Resource }) {
  const { run } = useWorkspace();
  const [slides, setSlides] = useState(() => deckSlides(page.body));
  const [at, setAt] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const sent = useRef(page.body);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const dirty = useRef(false);
  // A teammate's change shows unless you have unsent edits of your own.
  useEffect(() => {
    if (page.body === sent.current || dirty.current) return;
    sent.current = page.body;
    setSlides(deckSlides(page.body));
  }, [page.body]);
  const save = (next: typeof slides, now = false) => {
    setSlides(next);
    dirty.current = true;
    clearTimeout(timer.current);
    const push = () => {
      const body = JSON.stringify({ slides: next });
      sent.current = body;
      dirty.current = false;
      void run(() => api(`/resources/${page.id}`, { method: 'PATCH', body: { body } }));
    };
    if (now) push();
    else timer.current = setTimeout(push, 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const index = Math.min(at, slides.length - 1);
  const slide = slides[index];
  const change = (patch: Partial<typeof slide>) =>
    save(slides.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const move = (by: number) => {
    const to = index + by;
    if (to < 0 || to >= slides.length) return;
    const next = [...slides];
    [next[index], next[to]] = [next[to], next[index]];
    save(next, true);
    setAt(to);
  };
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPresenting(false);
      if (e.key === 'ArrowRight' || e.key === ' ') setAt((i) => Math.min(slides.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setAt((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, slides.length]);
  return (
    <div className="deck-page">
      <div className="deck-main">
        <ol className="deck-list" aria-label="Slides">
          {slides.map((x, i) => (
            <li key={i}>
              <button aria-current={i === index} onClick={() => setAt(i)}>
                <small>{i + 1}</small>
                <span className="thumb">
                  <strong>{x.title || 'Untitled slide'}</strong>
                  <span>{x.body.replace(/[#*_`>-]/g, ' ').slice(0, 60)}</span>
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              className="add"
              onClick={() => {
                save([...slides, { title: '', body: '' }], true);
                setAt(slides.length);
              }}
            >
              <Plus size={14} /> Slide
            </button>
          </li>
        </ol>
        <div className="deck-stage">
          <div className="deck-tools">
            <span>
              Slide {index + 1} of {slides.length}
            </span>
            <button aria-label="Move slide earlier" disabled={index === 0} onClick={() => move(-1)}>
              <ArrowUp size={13} />
            </button>
            <button
              aria-label="Move slide later"
              disabled={index === slides.length - 1}
              onClick={() => move(1)}
            >
              <ArrowDown size={13} />
            </button>
            <button
              aria-label="Delete slide"
              disabled={slides.length === 1}
              onClick={() => {
                save(
                  slides.filter((_, i) => i !== index),
                  true,
                );
                setAt(Math.max(0, index - 1));
              }}
            >
              <Trash2 size={13} />
            </button>
            <button className="primary" onClick={() => setPresenting(true)}>
              <Play size={13} /> Present
            </button>
          </div>
          <div className="slide">
            <input
              value={slide.title}
              placeholder="Slide title"
              aria-label="Slide title"
              onChange={(e) => change({ title: e.target.value })}
            />
            <textarea
              value={slide.body}
              placeholder={'What this slide says.\n- Start a line with a dash for a bullet'}
              aria-label="Slide text"
              onChange={(e) => change({ body: e.target.value })}
            />
          </div>
        </div>
      </div>
      {presenting && (
        <div
          className="present"
          role="dialog"
          aria-label="Presenting"
          onClick={() => setAt((i) => Math.min(slides.length - 1, i + 1))}
        >
          <button
            aria-label="Stop presenting"
            onClick={(e) => {
              e.stopPropagation();
              setPresenting(false);
            }}
          >
            <X size={18} />
          </button>
          <div className="present-slide">
            <h1>{slide.title}</h1>
            <Md text={slide.body} />
          </div>
          <small>
            {index + 1} / {slides.length} · arrow keys to move, Esc to stop
          </small>
        </div>
      )}
    </div>
  );
}
