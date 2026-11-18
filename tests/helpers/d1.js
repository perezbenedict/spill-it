// Minimal D1-shaped wrapper over node:sqlite so api/voting.js can be exercised
// against a real SQL engine with real triggers, not mocks.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE discussion_sessions (id TEXT PRIMARY KEY,title TEXT,topic TEXT,public_code TEXT,status TEXT);
CREATE TABLE voting_events (
 id TEXT PRIMARY KEY, public_code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft', session_id TEXT, revision INTEGER NOT NULL DEFAULT 0,
 results_version INTEGER NOT NULL DEFAULT 0, mutation_id TEXT, settings TEXT NOT NULL DEFAULT '{}',
 presentation TEXT NOT NULL DEFAULT '{}', ever_public INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, closed_at TEXT,
 current_round INTEGER NOT NULL DEFAULT 1,
 scheduled_open_at TEXT, deadline_at TEXT, instructions TEXT NOT NULL DEFAULT '',
 confirmed_option_id TEXT, confirmed_at TEXT, confirmed_by TEXT
);
CREATE TABLE voting_questions (
 id TEXT PRIMARY KEY, event_id TEXT NOT NULL, ballot_type TEXT NOT NULL DEFAULT 'single',
 text TEXT NOT NULL, position INTEGER NOT NULL, revealed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE voting_options (
 id TEXT PRIMARY KEY, question_id TEXT NOT NULL, label TEXT NOT NULL, position INTEGER NOT NULL,
 description TEXT NOT NULL DEFAULT ''
);
CREATE TABLE voting_rounds (
 event_id TEXT NOT NULL, round_number INTEGER NOT NULL, created_at TEXT NOT NULL,
 opened_at TEXT, last_opened_at TEXT, closed_at TEXT, reopen_count INTEGER NOT NULL DEFAULT 0,
 ever_public INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(event_id, round_number)
);
CREATE TABLE voting_votes (
 event_id TEXT NOT NULL, question_id TEXT NOT NULL, participant_id TEXT NOT NULL,
 option_id TEXT NOT NULL, created_at INTEGER NOT NULL, round_number INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(question_id, round_number, participant_id)
);
CREATE TABLE admin_activity (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
 target_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE admin_users (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('admin','moderator')),
 created_at TEXT NOT NULL
);
CREATE TABLE admin_sessions (
 token TEXT PRIMARY KEY, credential_version TEXT,
 user_id TEXT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE submissions (
 id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
 session_id TEXT NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL, request_id TEXT, nickname TEXT NOT NULL,
 category TEXT NOT NULL CHECK (category IN ('question','opinion','challenge','twocents')),
 content TEXT NOT NULL,
 moderation_status TEXT NOT NULL DEFAULT 'pending'
   CHECK (moderation_status IN ('pending','approved','hidden')),
 is_pinned INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0,1)),
 hidden_from_presentation INTEGER NOT NULL DEFAULT 0 CHECK (hidden_from_presentation IN (0,1)),
 discussed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE presentation_state (
 session_id TEXT PRIMARY KEY REFERENCES discussion_sessions(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL DEFAULT 0,
 current_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL, updated_by TEXT
);
CREATE TABLE moderation_history (
 id TEXT PRIMARY KEY, submission_id TEXT NOT NULL, session_id TEXT NOT NULL,
 actor_id TEXT, from_status TEXT,
 to_status TEXT NOT NULL CHECK (to_status IN ('pending','approved','hidden')),
 action TEXT NOT NULL CHECK (action IN ('approve','hide','restore')),
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE auth_rate_limits (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE spill_schema_migrations (version TEXT PRIMARY KEY);
INSERT INTO spill_schema_migrations(version) VALUES('006_voting');
`;

// node:sqlite accepts bare `?` placeholders positionally, so the D1-shaped
// wrapper passes SQL through unchanged.
function bindParams(sql, params) {
  return { converted: sql, params };
}

export function createD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  db.exec('PRAGMA foreign_keys=ON');

  function prepare(sql) {
    const statement = {
      _sql: sql,
      _params: [],
      bind(...params) { statement._params = params; return statement; },
      async first() {
        const { converted, params } = bindParams(sql, statement._params);
        const row = db.prepare(converted).get(...params);
        return row === undefined ? null : row;
      },
      async all() {
        const { converted, params } = bindParams(sql, statement._params);
        return { results: db.prepare(converted).all(...params) };
      },
      async run() {
        const { converted, params } = bindParams(sql, statement._params);
        const info = db.prepare(converted).run(...params);
        return { success: true, meta: { changes: Number(info.changes) } };
      },
    };
    return statement;
  }

  async function batch(statements) {
    // D1 runs a batch in one transaction; node:sqlite needs explicit BEGIN.
    db.exec('BEGIN');
    try {
      const out = [];
      for (const statement of statements) {
        const { converted, params } = bindParams(statement._sql, statement._params);
        const prepared = db.prepare(converted);
        // Statements with RETURNING expose rows; plain writes expose changes.
        let rows = [];
        try { rows = prepared.all(...params); } catch { prepared.run(...params); rows = []; }
        out.push({ results: rows, success: true });
      }
      db.exec('COMMIT');
      return out;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { DB: { prepare, batch }, _db: db };
}
