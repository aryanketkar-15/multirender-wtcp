-- Hash of every complete subtree: (level, idx) covers leaves idx*2^level .. (idx+1)*2^level - 1.
-- Level 0 holds the leaf hashes. Written once, never changed.
CREATE TABLE mra_node (
    level TINYINT UNSIGNED NOT NULL,
    idx   BIGINT UNSIGNED  NOT NULL,
    hash  BINARY(32)       NOT NULL,
    PRIMARY KEY (level, idx)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
