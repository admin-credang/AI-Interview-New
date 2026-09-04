-- ============================================================
-- AI Interview Agent
-- PostgreSQL Database Schema V1
-- ============================================================

-- ============================================================
-- 1. USERS
-- ============================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name VARCHAR(100) NOT NULL,

    email VARCHAR(255) UNIQUE NOT NULL,

    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL
        CHECK (role IN ('candidate', 'interviewer', 'admin')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 2. INTERVIEWS
-- ============================================================

CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title VARCHAR(255) NOT NULL,

    description TEXT,

    created_by UUID NOT NULL,

    duration INTEGER NOT NULL
        CHECK (duration > 0),

    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'archived')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_interviews_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE RESTRICT
);


-- ============================================================
-- 3. QUESTIONS
-- ============================================================

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    question TEXT NOT NULL,

    category VARCHAR(100) NOT NULL,

    difficulty VARCHAR(20) NOT NULL
        CHECK (difficulty IN ('easy', 'medium', 'hard')),

    type VARCHAR(30) NOT NULL
        CHECK (
            type IN (
                'technical',
                'behavioral',
                'situational',
                'coding',
                'general'
            )
        ),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- 4. INTERVIEW QUESTIONS
-- ============================================================

CREATE TABLE interview_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    interview_id UUID NOT NULL,

    question_id UUID NOT NULL,

    question_order INTEGER NOT NULL
        CHECK (question_order > 0),

    CONSTRAINT fk_interview_questions_interview
        FOREIGN KEY (interview_id)
        REFERENCES interviews(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_interview_questions_question
        FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE CASCADE,

    CONSTRAINT unique_interview_question
        UNIQUE (interview_id, question_id),

    CONSTRAINT unique_interview_question_order
        UNIQUE (interview_id, question_order)
);


-- ============================================================
-- 5. SESSIONS
-- ============================================================

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    interview_id UUID NOT NULL,

    candidate_id UUID NOT NULL,

    started_at TIMESTAMPTZ,

    ended_at TIMESTAMPTZ,

    status VARCHAR(20) NOT NULL DEFAULT 'not_started'
        CHECK (
            status IN (
                'not_started',
                'in_progress',
                'completed',
                'cancelled'
            )
        ),

    current_question INTEGER NOT NULL DEFAULT 1
        CHECK (current_question > 0),

    CONSTRAINT fk_sessions_interview
        FOREIGN KEY (interview_id)
        REFERENCES interviews(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sessions_candidate
        FOREIGN KEY (candidate_id)
        REFERENCES users(id)
        ON DELETE RESTRICT
);


-- ============================================================
-- 6. ANSWERS
-- ============================================================

CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL,

    question_id UUID NOT NULL,

    answer_text TEXT,

    audio_url TEXT,

    answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_answers_session
        FOREIGN KEY (session_id)
        REFERENCES sessions(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_answers_question
        FOREIGN KEY (question_id)
        REFERENCES questions(id)
        ON DELETE RESTRICT
);


-- ============================================================
-- 7. SCORES
-- ============================================================

CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    answer_id UUID NOT NULL UNIQUE,

    relevance NUMERIC(5,2)
        CHECK (relevance >= 0 AND relevance <= 100),

    accuracy NUMERIC(5,2)
        CHECK (accuracy >= 0 AND accuracy <= 100),

    technical_knowledge NUMERIC(5,2)
        CHECK (technical_knowledge >= 0 AND technical_knowledge <= 100),

    completeness NUMERIC(5,2)
        CHECK (completeness >= 0 AND completeness <= 100),

    communication NUMERIC(5,2)
        CHECK (communication >= 0 AND communication <= 100),

    overall_score NUMERIC(5,2)
        CHECK (overall_score >= 0 AND overall_score <= 100),

    CONSTRAINT fk_scores_answer
        FOREIGN KEY (answer_id)
        REFERENCES answers(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 8. FEEDBACK
-- ============================================================

CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    answer_id UUID NOT NULL UNIQUE,

    feedback_text TEXT NOT NULL,

    follow_up_required BOOLEAN NOT NULL DEFAULT FALSE,

    follow_up_question TEXT,

    CONSTRAINT fk_feedback_answer
        FOREIGN KEY (answer_id)
        REFERENCES answers(id)
        ON DELETE CASCADE
);


-- ============================================================
-- 9. REPORTS
-- ============================================================

CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    session_id UUID NOT NULL UNIQUE,

    overall_score NUMERIC(5,2)
        CHECK (overall_score >= 0 AND overall_score <= 100),

    summary TEXT,

    report_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_reports_session
        FOREIGN KEY (session_id)
        REFERENCES sessions(id)
        ON DELETE CASCADE
);


-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_interviews_created_by
    ON interviews(created_by);

CREATE INDEX idx_interview_questions_interview
    ON interview_questions(interview_id);

CREATE INDEX idx_sessions_candidate
    ON sessions(candidate_id);

CREATE INDEX idx_sessions_interview
    ON sessions(interview_id);

CREATE INDEX idx_answers_session
    ON answers(session_id);

CREATE INDEX idx_answers_question
    ON answers(question_id);

CREATE INDEX idx_scores_answer
    ON scores(answer_id);

CREATE INDEX idx_feedback_answer
    ON feedback(answer_id);

CREATE INDEX idx_reports_session
    ON reports(session_id);