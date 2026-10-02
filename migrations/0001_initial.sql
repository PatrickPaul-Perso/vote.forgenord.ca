PRAGMA foreign_keys = ON;
CREATE TABLE polls (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE,
 organization TEXT NOT NULL, title_fr TEXT NOT NULL, title_en TEXT NOT NULL,
 description_fr TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
 opens_at TEXT, closes_at TEXT,
 proposal_terms_fr TEXT NOT NULL DEFAULT '', proposal_terms_en TEXT NOT NULL DEFAULT '', proposal_terms_version TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at)
);
CREATE TABLE poll_options (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id),
 name_fr TEXT NOT NULL, name_en TEXT NOT NULL, description_fr TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
 image_key TEXT, external_url TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
 archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), UNIQUE(id,poll_id)
);
CREATE TABLE participations (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id), participant_token TEXT NOT NULL,
 choice_type TEXT NOT NULL CHECK(choice_type IN ('vote','proposal')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(poll_id,participant_token), UNIQUE(id,poll_id,choice_type)
);
CREATE TABLE votes (
 participation_id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, choice_type TEXT NOT NULL DEFAULT 'vote' CHECK(choice_type='vote'), option_id TEXT NOT NULL,
 FOREIGN KEY(participation_id,poll_id,choice_type) REFERENCES participations(id,poll_id,choice_type) ON DELETE CASCADE,
 FOREIGN KEY(option_id,poll_id) REFERENCES poll_options(id,poll_id)
);
CREATE TABLE proposals (
 participation_id TEXT PRIMARY KEY, poll_id TEXT NOT NULL, choice_type TEXT NOT NULL DEFAULT 'proposal' CHECK(choice_type='proposal'),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', language TEXT NOT NULL CHECK(language IN ('fr','en')),
 moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK(moderation_status IN ('pending','approved','rejected')),
 FOREIGN KEY(participation_id,poll_id,choice_type) REFERENCES participations(id,poll_id,choice_type) ON DELETE CASCADE
);
-- Promotional values are entered through management, never seeded in Git.
CREATE TABLE poll_parameters (
 poll_id TEXT NOT NULL REFERENCES polls(id), key TEXT NOT NULL CHECK(key IN ('promo_code','promo_starts_at','promo_ends_at')),
 value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(poll_id,key)
);
CREATE TABLE contacts (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id), participation_id TEXT REFERENCES participations(id) ON DELETE SET NULL,
 display_name TEXT, channel TEXT NOT NULL CHECK(channel IN ('email','tiktok','instagram','facebook')),
 address TEXT NOT NULL, normalized_address TEXT NOT NULL, UNIQUE(poll_id,channel,normalized_address), UNIQUE(id,poll_id)
);
CREATE TABLE draws (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 opens_at TEXT, closes_at TEXT, terms_fr TEXT NOT NULL DEFAULT '', terms_en TEXT NOT NULL DEFAULT '', terms_version TEXT NOT NULL DEFAULT '', validated_at TEXT,
 UNIQUE(id,poll_id), CHECK(opens_at IS NULL OR closes_at IS NULL OR opens_at < closes_at),
 CHECK(enabled=0 OR (length(trim(terms_fr))>0 AND length(trim(terms_en))>0 AND length(trim(terms_version))>0 AND validated_at IS NOT NULL))
);
CREATE TABLE consents (
 id TEXT PRIMARY KEY, poll_id TEXT NOT NULL REFERENCES polls(id), participation_id TEXT REFERENCES participations(id) ON DELETE SET NULL,
 contact_id TEXT, purpose TEXT NOT NULL CHECK(purpose IN ('model_reuse','public_mention','draw_contact','draw_terms')),
 text_fr TEXT NOT NULL, text_en TEXT NOT NULL, version TEXT NOT NULL, accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(contact_id,poll_id) REFERENCES contacts(id,poll_id), UNIQUE(id,poll_id,contact_id,purpose),
 CHECK((purpose='model_reuse' AND participation_id IS NOT NULL) OR (purpose!='model_reuse' AND contact_id IS NOT NULL))
);
CREATE TABLE draw_entries (
 id TEXT PRIMARY KEY, draw_id TEXT NOT NULL, poll_id TEXT NOT NULL, contact_id TEXT NOT NULL,
 contact_consent_id TEXT NOT NULL, contact_purpose TEXT NOT NULL DEFAULT 'draw_contact' CHECK(contact_purpose='draw_contact'),
 terms_consent_id TEXT NOT NULL, terms_purpose TEXT NOT NULL DEFAULT 'draw_terms' CHECK(terms_purpose='draw_terms'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(draw_id,contact_id),
 FOREIGN KEY(draw_id,poll_id) REFERENCES draws(id,poll_id), FOREIGN KEY(contact_id,poll_id) REFERENCES contacts(id,poll_id),
 FOREIGN KEY(contact_consent_id,poll_id,contact_id,contact_purpose) REFERENCES consents(id,poll_id,contact_id,purpose),
 FOREIGN KEY(terms_consent_id,poll_id,contact_id,terms_purpose) REFERENCES consents(id,poll_id,contact_id,purpose)
);
CREATE INDEX idx_options_poll ON poll_options(poll_id,sort_order);
CREATE INDEX idx_proposals_poll ON proposals(poll_id,moderation_status);
CREATE TRIGGER guard_draw_entry BEFORE INSERT ON draw_entries
WHEN NOT EXISTS(SELECT 1 FROM draws WHERE id=NEW.draw_id AND enabled=1 AND validated_at IS NOT NULL
 AND (opens_at IS NULL OR julianday(opens_at)<=julianday('now')) AND (closes_at IS NULL OR julianday(closes_at)>julianday('now')))
BEGIN SELECT RAISE(ABORT,'draw closed'); END;
