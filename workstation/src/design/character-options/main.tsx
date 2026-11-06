import { StrictMode, useState, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/dm-sans';
import '../../styles/tokens.css';
import '../../styles/app.css';
import './options.css';
import type { User } from '../../../shared/types.ts';
import { Character } from '../../features/agents/Character.tsx';
import {
  Badge,
  Bit,
  Orb,
  Pebble,
  type OptionProps,
  type OptionState,
  type SampleAgent,
} from './options.tsx';

const states: OptionState[] = ['idle', 'working', 'waiting'];

const stateTitle: Record<OptionState, string> = {
  idle: 'Idle',
  working: 'Working',
  waiting: 'Waiting for approval',
};

const sampleLine: Record<OptionState, string> = {
  idle: 'Ready when you are.',
  working: 'Drafting the launch brief…',
  waiting: 'Wants your OK to share the brief.',
};

const agents: SampleAgent[] = [
  { name: "Dylan's agent", hue: 210, shape: 'round', initial: 'D' },
  { name: 'Launch agent', hue: 28, shape: 'tall', initial: 'L' },
  { name: "Mira's agent", hue: 150, shape: 'wide', initial: 'M' },
  { name: 'Research agent', hue: 280, shape: 'round', initial: 'R' },
];

const appSizes = [
  { size: 18, where: 'chat & rail' },
  { size: 26, where: 'canvas' },
  { size: 28, where: 'graph' },
  { size: 40, where: 'panel' },
];

const CANVAS = 104;
const CHAT = 20;

function Current({ agent, size, state }: OptionProps) {
  const user: User = {
    id: `sample-${agent.initial}-0000`,
    name: agent.name,
    color: `hsl(${agent.hue} 35% 45%)`,
    kind: 'agent',
    character: { hue: agent.hue, shape: agent.shape, eyes: 'dot' },
  } as User;
  return <Character agent={user} size={size} state={state} />;
}

type Option = {
  id: string;
  number: string;
  name: string;
  summary: string;
  notes: string;
  Component: ComponentType<OptionProps>;
};

const options: Option[] = [
  {
    id: 'option-1',
    number: '1',
    name: 'Pebble',
    summary: 'A soft, flat charcoal blob with two pill eyes.',
    notes:
      'Friendly without being cute-for-its-own-sake. The eyes do the acting: they glance down at the work while working, and look up at you with a small speech bubble when it needs approval.',
    Component: Pebble,
  },
  {
    id: 'option-2',
    number: '2',
    name: 'Orb',
    summary: 'An abstract core inside a thin ring; state lives in the motion.',
    notes:
      'No face at all. A rotating arc means working; the core contracts into a held dot with a pulsing ring when it waits for you. Quietest option, closest to system UI.',
    Component: Orb,
  },
  {
    id: 'option-3',
    number: '3',
    name: 'Bit',
    summary: 'A small line-drawn robot mascot with a screen face.',
    notes:
      'The most character. Full body on the canvas (typing on a laptop, raising a hand to ask), head only at chat size. Antenna tip varies per agent.',
    Component: Bit,
  },
  {
    id: 'option-4',
    number: '4',
    name: 'Badge',
    summary: 'A charcoal squircle with the agent’s initial and a soft aura.',
    notes:
      'Reads like a person’s avatar, but squared off and monochrome so agents are still distinct from people. The aura sweeps while working and rings when waiting.',
    Component: Badge,
  },
];

function ChatRow({
  Component,
  agent,
  state,
}: {
  Component: ComponentType<OptionProps>;
  agent: SampleAgent;
  state: OptionState;
}) {
  return (
    <div className="co-chat">
      <Component agent={agent} size={CHAT} state={state} />
      <div className="co-chat-text">
        <div className="co-chat-head">
          <strong>{agent.name}</strong>
          <span>2:14 PM</span>
        </div>
        <div className="co-chat-body">{sampleLine[state]}</div>
      </div>
    </div>
  );
}

function OptionCard({
  option,
  reference,
}: {
  option: Omit<Option, 'id'> & { id: string };
  reference?: boolean;
}) {
  const { Component } = option;
  return (
    <section id={option.id} className={`co-card ${reference ? 'is-reference' : ''}`}>
      <header className="co-card-head">
        <div className="co-number">{option.number}</div>
        <div>
          <h2>{option.name}</h2>
          <p className="co-summary">{option.summary}</p>
          <p className="co-notes">{option.notes}</p>
        </div>
      </header>
      <div className="co-states">
        {states.map((state) => (
          <div key={state} className="co-state">
            <div className="co-label">{stateTitle[state]}</div>
            <div className="co-stage">
              <Component agent={agents[0]} size={CANVAS} state={state} />
            </div>
            <ChatRow Component={Component} agent={agents[0]} state={state} />
          </div>
        ))}
      </div>
      <div className="co-footer">
        <div className="co-strip">
          <div className="co-label">Sizes used in the app</div>
          <div className="co-sizes">
            {appSizes.map(({ size, where }) => (
              <div key={size} className="co-size">
                <Component agent={agents[0]} size={size} state="idle" />
                <span>
                  {size}px · {where}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="co-strip">
          <div className="co-label">Different agents</div>
          <div className="co-sizes">
            {agents.map((agent) => (
              <div key={agent.name} className="co-size">
                <Component agent={agent} size={40} state="idle" />
                <span>{agent.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Page() {
  const [dark, setDark] = useState(false);
  return (
    <main className="co-page">
      <header className="co-top">
        <div>
          <h1>Agent character options</h1>
          <p>
            Four directions for the agent character, each at canvas and chat size in its three
            states. Nothing here is wired into the app yet. Names and messages are samples for
            comparison.
          </p>
        </div>
        <button
          className="co-toggle"
          onClick={() => {
            const next = !dark;
            setDark(next);
            document.documentElement.dataset.theme = next ? 'dark' : 'light';
          }}
        >
          {dark ? 'Light' : 'Dark'} theme
        </button>
      </header>
      {options.map((option) => (
        <OptionCard key={option.id} option={option} />
      ))}
      <OptionCard
        reference
        option={{
          id: 'current',
          number: '·',
          name: 'Current',
          summary: 'Today’s pastel gradient blob, for reference.',
          notes: 'Shown with the same sizes and states so the options can be compared directly.',
          Component: Current,
        }}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
