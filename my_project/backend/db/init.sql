-- Roles Table: Defines different user roles within the system
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table: Stores information about all users
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    role_id INT NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Store hashed passwords
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_role FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE RESTRICT
);

-- Experts Table: Extends users table for expert-specific information
CREATE TABLE experts (
    expert_id SERIAL PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    cv_path VARCHAR(255), -- Path to CV document
    availability TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Subjects Table: Lists all possible subjects experts can be associated with
CREATE TABLE subjects (
    subject_id SERIAL PRIMARY KEY,
    subject_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Expert_Subjects Table: Join table linking experts to subjects
CREATE TABLE expert_subjects (
    expert_subject_id SERIAL PRIMARY KEY,
    expert_id INT NOT NULL,
    subject_id INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_expert FOREIGN KEY (expert_id) REFERENCES experts(expert_id) ON DELETE CASCADE,
    CONSTRAINT fk_subject FOREIGN KEY (subject_id) REFERENCES subjects(subject_id) ON DELETE CASCADE,
    UNIQUE (expert_id, subject_id) -- Ensures an expert is not listed twice for the same subject
);

-- Schools Table: Information about participating schools
CREATE TABLE schools (
    school_id SERIAL PRIMARY KEY,
    school_name VARCHAR(255) UNIQUE NOT NULL,
    address TEXT,
    contact_person VARCHAR(100),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Plessi Table: Specific locations or campuses related to a school
CREATE TABLE plessi ( -- Italian for "school complex" or "campus"
    plesso_id SERIAL PRIMARY KEY, -- Using plesso_id as singular of plessi
    school_id INT NOT NULL,
    plesso_name VARCHAR(255) NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_school FOREIGN KEY (school_id) REFERENCES schools(school_id) ON DELETE CASCADE,
    UNIQUE (school_id, plesso_name) -- Ensures a plesso name is unique within a school
);

-- Projects Table: Educational projects initiated by schools
CREATE TABLE projects (
    project_id SERIAL PRIMARY KEY,
    school_id INT NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    project_code VARCHAR(50) UNIQUE, -- Official project code, if any
    description TEXT,
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'Pending', -- e.g., Pending, Active, Completed, Cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_school FOREIGN KEY (school_id) REFERENCES schools(school_id) ON DELETE CASCADE
);

-- Project_Documents Table: Documents related to projects
CREATE TABLE project_documents (
    document_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL,
    document_name VARCHAR(255) NOT NULL,
    document_path VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

-- Courses Table: Specific courses offered within a project
CREATE TABLE courses (
    course_id SERIAL PRIMARY KEY,
    project_id INT NOT NULL,
    course_name VARCHAR(255) NOT NULL,
    description TEXT,
    duration_hours NUMERIC(5,1), -- Total planned duration of the course in hours
    start_date DATE,
    end_date DATE,
    status VARCHAR(50) DEFAULT 'Scheduled', -- e.g., Scheduled, In Progress, Completed, Cancelled
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

-- Course_Experts Table: Join table linking courses to experts assigned to them
CREATE TABLE course_experts (
    course_expert_id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    expert_id INT NOT NULL,
    hourly_cost DECIMAL(10, 2) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'Pending', -- e.g., Pending, Processed, Paid
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    CONSTRAINT fk_expert FOREIGN KEY (expert_id) REFERENCES experts(expert_id) ON DELETE RESTRICT, -- Prevent expert deletion if assigned
    UNIQUE (course_id, expert_id)
);

-- Course_Tutors Table: Tutors (school internal staff) associated with a course
CREATE TABLE course_tutors (
    course_tutor_id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    tutor_name VARCHAR(100) NOT NULL, -- Assuming tutor name is sufficient, not a full user
    tutor_email VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE
);

-- Calendar_Lessons Table: Individual lesson entries in a calendar
CREATE TABLE calendar_lessons (
    lesson_id SERIAL PRIMARY KEY,
    course_id INT NOT NULL,
    plesso_id INT, -- Nullable if lesson is online or not tied to a specific plesso
    lesson_title VARCHAR(255) NOT NULL,
    lesson_description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    location_details VARCHAR(255), -- e.g., Room number, or "Online"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course FOREIGN KEY (course_id) REFERENCES courses(course_id) ON DELETE CASCADE,
    CONSTRAINT fk_plesso FOREIGN KEY (plesso_id) REFERENCES plessi(plesso_id) ON DELETE SET NULL -- If plesso is deleted, don't delete lesson
);

-- Lesson_Experts Table: Join table linking specific lessons to the expert(s) teaching them
-- This allows for multiple experts per lesson if needed, or tracking which expert taught which lesson
CREATE TABLE lesson_experts (
    lesson_expert_id SERIAL PRIMARY KEY,
    lesson_id INT NOT NULL,
    course_expert_id INT NOT NULL, -- References the specific assignment of an expert to a course (and their pay rate)
    notes TEXT, -- Any notes specific to this expert for this lesson
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lesson FOREIGN KEY (lesson_id) REFERENCES calendar_lessons(lesson_id) ON DELETE CASCADE,
    CONSTRAINT fk_course_expert FOREIGN KEY (course_expert_id) REFERENCES course_experts(course_expert_id) ON DELETE CASCADE,
    UNIQUE (lesson_id, course_expert_id)
);

-- Triggers to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply the trigger to all tables that have an updated_at column
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT table_name
        FROM information_schema.columns
        WHERE column_name = 'updated_at' AND table_schema = 'public' -- Adjust schema if needed
    LOOP
        EXECUTE format('CREATE TRIGGER update_%I_updated_at
                        BEFORE UPDATE ON %I
                        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t, t);
    END LOOP;
END;
$$;

-- Insert or Update initial roles to ensure 'Amministratore' and 'Esperto' exist
-- Using INSERT ... ON CONFLICT to prevent errors if roles already exist or to update them.
-- This assumes role_name is UNIQUE.
INSERT INTO roles (role_name) VALUES ('Amministratore'), ('Referente Scolastico'), ('Esperto')
ON CONFLICT (role_name) DO UPDATE SET role_name = EXCLUDED.role_name;

-- Ensure old 'admin', 'school_contact', 'expert' are updated or removed if they are different
-- For simplicity, we'll rely on the above INSERT ... ON CONFLICT to standardize,
-- but a more robust migration would handle renaming existing roles if needed.
-- Let's assume the above covers the necessary roles. If 'admin' was pk 1, 'Amministratore' might become pk 4.
-- It's often better to manage role IDs consistently. For now, this ensures they exist.

-- Create an initial Admin user
-- The role_id for 'Amministratore' will be fetched via a subquery.
-- Ensure the password is pre-hashed. The hash below is for 'adminpassword'.
-- REPLACE '$2b$10$jbu0oksm5HNqL7JQAwgSROHgRuyhaNcP4whFxR2f7Y6idJ12WwyKe' with the actual hash if different.
DO $$
DECLARE
    admin_role_id INT;
BEGIN
    SELECT role_id INTO admin_role_id FROM roles WHERE role_name = 'Amministratore' LIMIT 1;

    IF admin_role_id IS NOT NULL THEN
        -- Check if admin user already exists
        IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'admin@example.com') THEN
            INSERT INTO users (first_name, last_name, email, password_hash, role_id, is_active)
            VALUES ('Admin', 'User', 'admin@example.com', '$2b$10$jbu0oksm5HNqL7JQAwgSROHgRuyhaNcP4whFxR2f7Y6idJ12WwyKe', admin_role_id, TRUE);
        ELSE
            RAISE NOTICE 'User admin@example.com already exists.';
            -- Optionally, update the password or role if needed for an existing admin user
            -- UPDATE users SET password_hash = '$2b$10$jbu0oksm5HNqL7JQAwgSROHgRuyhaNcP4whFxR2f7Y6idJ12WwyKe', role_id = admin_role_id
            -- WHERE email = 'admin@example.com';
        END IF;
    ELSE
        RAISE WARNING 'Role Amministratore not found, cannot create admin user.';
    END IF;
END $$;


-- Example of inserting a school (adjust as needed)
-- INSERT INTO schools (school_name, contact_person, contact_email)
-- VALUES ('Example High School', 'John Doe', 'john.doe@examplehs.com');

-- Example of inserting a user (adjust as needed, ensure role_id corresponds to an existing role)
-- INSERT INTO users (role_id, first_name, last_name, email, password_hash)
-- VALUES (1, 'Admin', 'User', 'admin@example.com', 'some_strong_hash_here'); -- Replace with actual hashed password

-- Example of making that user an expert
-- INSERT INTO experts (user_id, cv_path, availability)
-- VALUES (1, '/path/to/cv.pdf', 'Mon-Fri, 9am-5pm');

-- Example of inserting a subject
-- INSERT INTO subjects (subject_name, description)
-- VALUES ('Mathematics', 'The study of numbers, quantity, space, structure, and change.');

-- Example of linking an expert to a subject
-- INSERT INTO expert_subjects (expert_id, subject_id)
-- VALUES (1, 1);

COMMIT; -- Not strictly necessary in psql unless in a transaction block, but good practice for scripts.
-- Using BEGIN/COMMIT might be better if executing as a single transaction.
-- However, psql by default runs each statement in its own transaction if not in a BEGIN block.
-- For simplicity here, not wrapping the whole script in BEGIN/COMMIT.
-- If any CREATE TABLE fails, subsequent ones might also fail or not run.
-- Consider using `psql -v ON_ERROR_STOP=1` when executing.
