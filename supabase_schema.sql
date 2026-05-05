-- ──────────────────────────────────────────────────────────────────────────────
-- Marketing AI System — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ──────────────────────────────────────────────────────────────────────────────

-- Enable pgvector extension (for real vector similarity search)
-- Uncomment this if your Supabase project has pgvector enabled:
-- create extension if not exists vector;

-- ─── 1. Gold Standards ────────────────────────────────────────────────────────
-- Store high-performing reference content used for comparison during evaluation.
-- Add your gold standard examples here — the more you add, the better the system learns.

create table if not exists gold_standards (
  id           uuid primary key default gen_random_uuid(),
  content      text         not null,
  industry     text         not null,
  content_type text         not null default 'general',  -- e.g. 'landing_page', 'ad', 'email', 'social'
  -- embedding vector(128),  -- uncomment for real pgvector support
  embedding    jsonb,                                    -- stores mock embedding array as JSON
  metadata     jsonb        default '{}',
  created_at   timestamptz  default now()
);

-- Index for faster industry lookups
create index if not exists idx_gold_standards_industry on gold_standards(industry);

-- ─── 2. Generated Outputs ─────────────────────────────────────────────────────
-- Every pipeline run's final content is stored here for tracking and reuse.

create table if not exists generated_outputs (
  id           uuid primary key default gen_random_uuid(),
  content      text         not null,
  input        jsonb        not null default '{}',    -- original CampaignInput
  -- embedding vector(128),  -- uncomment for real pgvector support
  embedding    jsonb,
  version      integer      not null default 1,
  created_at   timestamptz  default now()
);

-- ─── 3. Evaluations ───────────────────────────────────────────────────────────
-- Each evaluation loop iteration is stored with full scores and feedback.

create table if not exists evaluations (
  id                   uuid primary key default gen_random_uuid(),
  generated_output_id  uuid         references generated_outputs(id) on delete cascade,
  score                numeric(4,2) not null,            -- composite score (0–10)
  critic_score         numeric(4,2) not null,
  comparator_score     numeric(4,2) not null,
  feedback             text         not null default '',
  created_at           timestamptz  default now()
);

create index if not exists idx_evaluations_output_id on evaluations(generated_output_id);

-- ─── 4. Learned Patterns ──────────────────────────────────────────────────────
-- Patterns extracted by the Learning Agent after each pipeline run.
-- Accumulate over time to improve system performance.

create table if not exists learned_patterns (
  id           uuid primary key default gen_random_uuid(),
  pattern      text         not null,
  type         text         not null default 'general',  -- e.g. 'headline', 'cta', 'tone', 'structure'
  confidence   numeric(4,3) not null default 0.5,        -- 0.0 to 1.0
  created_at   timestamptz  default now()
);

create index if not exists idx_patterns_type on learned_patterns(type);

-- ──────────────────────────────────────────────────────────────────────────────
-- SEED: Example Gold Standards
-- Add your own high-performing content here.
-- The more industry-specific examples you add, the better the comparator works.
-- ──────────────────────────────────────────────────────────────────────────────

insert into gold_standards (content, industry, content_type, metadata) values
(
  '{"headline": "10x Your Team''s Output in 30 Days — Or It''s Free", "subheadline": "The project management platform built for teams that actually ship.", "body_copy": "Stop losing hours to status meetings and unclear priorities. Notion gives your team a single source of truth — from roadmaps to daily standups. 50,000+ teams moved from chaos to clarity in under a week.", "cta": "Start Free — No Credit Card Required", "social_proof": "Used by Figma, Ramp, and 50,000+ high-growth teams", "urgency_line": "Set up your workspace in 10 minutes today."}',
  'SaaS / Productivity',
  'landing_page',
  '{"brand": "Notion", "source": "seed", "performance": "high"}'
),
(
  '{"headline": "Your Money Should Work Harder Than You Do", "subheadline": "Automated investing that grows with you — starting at just $1.", "body_copy": "Most investment apps are built for finance bros. Acorns is built for the rest of us. Round up your everyday purchases and invest the spare change automatically. Over 9 million Americans are already growing their wealth this way.", "cta": "Start Investing in 5 Minutes", "social_proof": "9 million+ investors | 4.7 stars App Store", "urgency_line": ""}',
  'Finance / Investing',
  'landing_page',
  '{"brand": "Acorns", "source": "seed", "performance": "high"}'
),
(
  '{"headline": "The Freelancer''s Secret to Winning More Clients", "subheadline": "Proposals that close. Contracts that protect. Invoices that get paid.", "body_copy": "Stop losing deals to slow follow-ups and unprofessional PDFs. HoneyBook gives freelancers a complete business OS — from first inquiry to final payment. 70% of bookings happen in the first 24 hours of responding.", "cta": "Try HoneyBook Free for 7 Days", "social_proof": "Trusted by 100,000+ freelancers and small businesses", "urgency_line": "Join 100,000 freelancers earning more with less admin."}',
  'Freelance / Creative Services',
  'landing_page',
  '{"brand": "HoneyBook", "source": "seed", "performance": "high"}'
);

-- ──────────────────────────────────────────────────────────────────────────────
-- ADDING YOUR OWN GOLD STANDARDS LATER:
--
-- insert into gold_standards (content, industry, content_type, metadata) values (
--   '{"headline": "Your headline here", ...}',
--   'Your Industry',
--   'landing_page',       -- or: ad, email, social, video_script
--   '{"source": "manual", "performance": "high"}'
-- );
--
-- Tip: Add real-world high-performing ads, landing pages, and email campaigns
-- from your industry. The more specific and relevant, the better comparisons.
-- ──────────────────────────────────────────────────────────────────────────────
