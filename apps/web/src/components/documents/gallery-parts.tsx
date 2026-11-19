'use client';

import { diffWords } from '@athleit/core';

import { Badge, Button, Icon, IconCircle, SegmentedControl } from '@/components/ui';
import builders from '@/components/builders/builders.module.css';
import team from '@/components/team/team.module.css';

import docs from './documents.module.css';

const V3 = 'I give permission for my child to take part in practices, games and team events.';
const DRAFT =
  'I give permission for my child to take part in practices, games, tournaments and team events.';

/** Static states for the visual gallery: compliance, waiver library card, diff, documents, upload errors, undo. */
export function WaiversDocumentsGallery() {
  const ops = diffWords(V3, DRAFT);
  return (
    <div className={docs.stack}>
      <span className={docs.kicker}>Waivers · compliance</span>
      <div className={team.stack}>
        <div className={team.tiles}>
          <div className={team.tile}>
            <span className={team.tileLabel}>
              <Icon name="check-circle" size="sm" weight="fill" /> Signed
            </span>
            <span className={team.tileValue}>42</span>
          </div>
          <div className={team.tile}>
            <span className={team.tileLabel}>
              <Icon name="clock-countdown" size="sm" weight="fill" /> Expired
            </span>
            <span className={team.tileValue}>4</span>
          </div>
          <div className={team.tile}>
            <span className={team.tileLabel}>
              <Icon name="warning-circle" size="sm" weight="fill" /> Missing
            </span>
            <span className={team.tileValue}>8</span>
          </div>
        </div>
        <div className={team.bar} role="img" aria-label="42 signed, 4 expired, 8 missing">
          <span className={team.barOk} style={{ width: '78%' }} />
          <span className={team.barWarn} style={{ width: '7%' }} />
          <span className={team.barBad} style={{ width: '15%' }} />
        </div>
        <ul className={team.groupRows}>
          <li className={team.compRow}>
            <strong className={team.grow}>Emi Hayes</strong>
            <Badge tone="danger">Missing</Badge>
            <Button variant="secondary">
              <Icon name="bell-ringing" size="sm" /> Send reminder
            </Button>
          </li>
          <li className={team.compRow}>
            <strong className={team.grow}>Noah Wells</strong>
            <Badge tone="warning">Expired</Badge>
            <Button variant="secondary" disabled>
              <Icon name="bell-ringing" size="sm" /> Reminded
            </Button>
          </li>
        </ul>
      </div>

      <span className={docs.kicker}>Waivers · library card</span>
      <div
        className={team.waiverCard}
        style={{ maxWidth: 'calc(var(--size-sidebar-width) * 1.3)' }}
      >
        <div className={team.row}>
          <IconCircle>
            <Icon name="file-text" />
          </IconCircle>
          <Badge tone="success">
            <Icon name="check-circle" size="sm" /> Published v3
          </Badge>
        </div>
        <h3 className={team.cardTitle}>Liability Waiver</h3>
        <span className={team.muted}>Required for</span>
        <span className={team.row}>
          <Badge>U8 Boys</Badge>
          <Badge>U10 Girls</Badge>
        </span>
        <label className={team.switchLine}>
          <input type="checkbox" defaultChecked readOnly />
          <span>Required</span>
        </label>
      </div>

      <span className={docs.kicker}>Waiver builder · compare with draft</span>
      <div className={builders.diffCols}>
        <div className={builders.page}>
          <span className={builders.kicker}>v3 · Published Nov 12</span>
          <p className={builders.diffText}>
            {ops
              .filter((o) => o.type !== 'add')
              .map((o, i) =>
                o.type === 'del' ? (
                  <del key={i} className={builders.del}>
                    {o.text}
                  </del>
                ) : (
                  <span key={i}>{o.text}</span>
                ),
              )}
          </p>
        </div>
        <div className={builders.page}>
          <span className={builders.kicker}>Draft v4 · today</span>
          <p className={builders.diffText}>
            {ops
              .filter((o) => o.type !== 'del')
              .map((o, i) =>
                o.type === 'add' ? (
                  <ins key={i} className={builders.ins}>
                    {o.text}
                  </ins>
                ) : (
                  <span key={i}>{o.text}</span>
                ),
              )}
          </p>
        </div>
      </div>

      <span className={docs.kicker}>Documents · pills, pinned and list</span>
      <div className={docs.pills}>
        {['All 14', 'Rules 4', 'Schedule 3', 'Tournament 2'].map((l, i) => (
          <button
            key={l}
            type="button"
            className={`${docs.pill} ${i === 0 ? docs.pillOn : ''}`}
            aria-pressed={i === 0}
          >
            {l}
          </button>
        ))}
      </div>
      <ul className={docs.pinnedGrid}>
        <li className={`${docs.card} ${docs.cardBig}`}>
          <div className={`${docs.row} ${docs.between}`}>
            <Icon name="file-pdf" size="lg" />
            <span className={docs.chip}>
              <Icon name="push-pin" size="sm" weight="fill" /> Pinned
            </span>
          </div>
          <button type="button" className={docs.title}>
            Fall League Rules.pdf
          </button>
          <span className={docs.muted}>Rules · 412 KB</span>
          <span className={docs.chip}>
            <Icon name="users-three" size="sm" /> Team members
          </span>
        </li>
      </ul>
      <SegmentedControl
        label="Layout"
        value="grid"
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
        onChange={() => undefined}
      />

      <span className={docs.kicker}>Documents · upload errors</span>
      <div className={`${docs.fileRow} ${docs.fileBad}`}>
        <span className={docs.row}>
          <Icon name="file" /> Season Video.mov · 48.0 MB
        </span>
        <span className={docs.err}>
          <Icon name="warning-circle" size="sm" /> Over the 20 MB limit (48 MB)
        </span>
      </div>
      <div className={`${docs.fileRow} ${docs.fileBad}`}>
        <span className={docs.row}>
          <Icon name="file" /> roster.exe · 1 KB
        </span>
        <span className={docs.err}>
          <Icon name="warning-circle" size="sm" /> Not supported. Use PDF, images or Office files.
        </span>
      </div>
      <div
        className={docs.undo}
        style={{ position: 'static', transform: 'none', width: 'fit-content' }}
        role="status"
      >
        <Icon name="archive-box" size="sm" /> Archived “Coach Code of Conduct.pdf”
        <Button variant="secondary">Undo</Button>
      </div>
    </div>
  );
}
