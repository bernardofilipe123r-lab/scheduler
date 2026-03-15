-- Widen content_type column from VARCHAR(10) to VARCHAR(20)
-- Required because 'threads_post' (12 chars) exceeds VARCHAR(10)
-- This was causing StringDataRightTruncation errors that poisoned DB sessions
-- and cascaded into PendingRollbackError across all Toby operations.

ALTER TABLE toby_content_tags ALTER COLUMN content_type TYPE VARCHAR(20);
ALTER TABLE toby_episodic_memory ALTER COLUMN content_type TYPE VARCHAR(20);
ALTER TABLE toby_procedural_memory ALTER COLUMN content_type TYPE VARCHAR(20);
ALTER TABLE toby_strategy_combos ALTER COLUMN content_type TYPE VARCHAR(20);
ALTER TABLE toby_experiments ALTER COLUMN content_type TYPE VARCHAR(20);
ALTER TABLE toby_strategy_scores ALTER COLUMN content_type TYPE VARCHAR(20);
