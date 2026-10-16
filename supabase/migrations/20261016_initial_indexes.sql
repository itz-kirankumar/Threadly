-- Wisentry Production Database Schema & Performance Indexes
-- PostgreSQL / Supabase Migration

-- 1. Waitlist Table
CREATE TABLE IF NOT EXISTS public.waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    startup_name TEXT NOT NULL,
    industry TEXT NOT NULL,
    url TEXT,
    challenge1 TEXT NOT NULL,
    challenge2 TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_industry ON public.waitlist (industry);
CREATE INDEX IF NOT EXISTS idx_waitlist_startup_name ON public.waitlist (startup_name);

-- 2. Community Table
CREATE TABLE IF NOT EXISTS public.community (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_community_email ON public.community (email);
CREATE INDEX IF NOT EXISTS idx_community_created_at ON public.community (created_at DESC);

-- 3. Workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'My company',
    logo_url TEXT,
    domain TEXT,
    context JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces (owner_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_created_at ON public.workspaces (created_at DESC);

-- 4. Opportunities (Signals) Table
CREATE TABLE IF NOT EXISTS public.opportunities (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL DEFAULT 'X',
    community TEXT NOT NULL,
    author TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    pain TEXT,
    intent TEXT NOT NULL DEFAULT 'Unrated',
    relevance INTEGER DEFAULT 0,
    engagement TEXT,
    source_url TEXT,
    source_kind TEXT NOT NULL DEFAULT 'manual',
    status TEXT NOT NULL DEFAULT 'new',
    observed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_workspace ON public.opportunities (workspace_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_status ON public.opportunities (status);
CREATE INDEX IF NOT EXISTS idx_opportunities_intent ON public.opportunities (intent);
CREATE INDEX IF NOT EXISTS idx_opportunities_platform ON public.opportunities (platform);
CREATE INDEX IF NOT EXISTS idx_opportunities_observed_at ON public.opportunities (observed_at DESC);

-- 5. Leads Pipeline Table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    opportunity_id TEXT,
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    role TEXT,
    platform TEXT NOT NULL DEFAULT 'X',
    pain TEXT,
    stage TEXT NOT NULL DEFAULT 'identified',
    notes TEXT,
    owner TEXT,
    qualification JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_workspace ON public.leads (workspace_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads (stage);
CREATE INDEX IF NOT EXISTS idx_leads_email ON public.leads (email);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads (created_at DESC);

-- 6. Content Drafts Table
CREATE TABLE IF NOT EXISTS public.drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    opportunity_id TEXT,
    platform TEXT NOT NULL DEFAULT 'X',
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    origin TEXT NOT NULL DEFAULT 'user',
    approved_at TIMESTAMPTZ,
    approved_by TEXT,
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_drafts_workspace ON public.drafts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON public.drafts (status);
CREATE INDEX IF NOT EXISTS idx_drafts_scheduled_at ON public.drafts (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_drafts_created_at ON public.drafts (created_at DESC);

-- 7. Outreach Emails Table
CREATE TABLE IF NOT EXISTS public.outreach_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    provider_message_id TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_outreach_workspace ON public.outreach_emails (workspace_id);
CREATE INDEX IF NOT EXISTS idx_outreach_lead ON public.outreach_emails (lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON public.outreach_emails (status);
CREATE INDEX IF NOT EXISTS idx_outreach_recipient ON public.outreach_emails (recipient);
CREATE INDEX IF NOT EXISTS idx_outreach_created_at ON public.outreach_emails (created_at DESC);

-- 8. Team Members & Invites
CREATE TABLE IF NOT EXISTS public.team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member', -- 'Owner', 'Admin', 'Growth Lead', 'Member'
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    joined_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_team_workspace ON public.team_members (workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_email ON public.team_members (email);

CREATE TABLE IF NOT EXISTS public.team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'Member',
    token TEXT UNIQUE NOT NULL,
    invited_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invites_workspace ON public.team_invites (workspace_id);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.team_invites (token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON public.team_invites (email);

-- 9. Automated Workflows Table
CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id TEXT NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    action_type TEXT NOT NULL,
    configuration JSONB DEFAULT '{}'::jsonb NOT NULL,
    enabled BOOLEAN DEFAULT true NOT NULL,
    last_run_at TIMESTAMPTZ,
    executions_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON public.workflows (workspace_id);
CREATE INDEX IF NOT EXISTS idx_workflows_enabled ON public.workflows (enabled);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger ON public.workflows (trigger_type);
