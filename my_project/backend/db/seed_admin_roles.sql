-- Insert or Update initial roles to ensure 'Amministratore' and 'Esperto' exist
INSERT INTO roles (role_name) VALUES ('Amministratore'), ('Referente Scolastico'), ('Esperto')
ON CONFLICT (role_name) DO UPDATE SET role_name = EXCLUDED.role_name;

-- Create an initial Admin user
DO $$
DECLARE
    admin_role_id INT;
BEGIN
    SELECT role_id INTO admin_role_id FROM roles WHERE role_name = 'Amministratore' LIMIT 1;

    IF admin_role_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com') THEN
            INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active)
            VALUES ('Admin', 'User', 'admin@example.com', '$2b$10$jbu0oksm5HNqL7JQAwgSROHgRuyhaNcP4whFxR2f7Y6idJ12WwyKe', admin_role_id, TRUE);
            RAISE NOTICE 'User admin@example.com created.';
        ELSE
            RAISE NOTICE 'User admin@example.com already exists.';
            -- Optionally, update the password or role if needed for an existing admin user
            -- UPDATE users SET password_hash = '$2b$10$jbu0oksm5HNqL7JQAwgSROHgRuyhaNcP4whFxR2f7Y6idJ12WwyKe', role_id = admin_role_id
            -- WHERE email = 'admin@example.com';
            -- RAISE NOTICE 'User admin@example.com updated if necessary.';
        END IF;
    ELSE
        RAISE WARNING 'Role Amministratore not found, cannot create admin user.';
    END IF;
END $$;

COMMIT;
