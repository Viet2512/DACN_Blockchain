CREATE TABLE IF NOT EXISTS user_actor_mappings (
  user_id CHAR(36) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, actor_id),
  CONSTRAINT fk_actor_mapping_user FOREIGN KEY (user_id) REFERENCES application_user_profiles(user_id),
  CONSTRAINT fk_actor_mapping_actor FOREIGN KEY (actor_id) REFERENCES actors(actor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO user_actor_mappings(user_id,actor_id)
SELECT p.user_id,u.actor_id FROM application_user_profiles p
JOIN user_accounts u ON u.username=p.username WHERE u.actor_id IS NOT NULL
ON DUPLICATE KEY UPDATE user_id=user_actor_mappings.user_id;
