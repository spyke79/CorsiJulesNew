DO $$
DECLARE
    test_school_id INT;
    test_project_id INT;
    test_course_id INT;
    expert_role_id INT;
    expert_user_id INT;
    expert_expert_id INT;
    expert_course_expert_id INT;
    test_lesson_id INT; -- Added declaration for test_lesson_id
    today_date DATE := CURRENT_DATE;
BEGIN
    -- 0. Get 'Esperto' role ID
    SELECT role_id INTO expert_role_id FROM roles WHERE role_name = 'Esperto' LIMIT 1;
    IF expert_role_id IS NULL THEN
        RAISE EXCEPTION 'Role Esperto not found. Please ensure it exists.';
    END IF;

    -- 1. Ensure 'Test School' exists
    INSERT INTO schools (school_name, contact_person, contact_email)
    VALUES ('Test School', 'Test Contact', 'contact@testschool.com')
    ON CONFLICT (school_name) DO UPDATE SET school_name = EXCLUDED.school_name -- dummy update to get ID
    RETURNING school_id INTO test_school_id;

    IF test_school_id IS NULL THEN -- If ON CONFLICT DO NOTHING, this might be needed
        SELECT school_id INTO test_school_id FROM schools WHERE school_name = 'Test School';
    END IF;

    -- 2. Ensure 'Test Project' exists
    INSERT INTO projects (school_id, project_name, project_code, description, start_date, end_date, status)
    VALUES (test_school_id, 'Test Project', 'TP001', 'A test project for demonstration', today_date - INTERVAL '1 month', today_date + INTERVAL '1 month', 'Active')
    ON CONFLICT (project_code) DO UPDATE SET project_name = EXCLUDED.project_name
    RETURNING project_id INTO test_project_id;

    IF test_project_id IS NULL THEN
        SELECT project_id INTO test_project_id FROM projects WHERE project_code = 'TP001';
    END IF;

    -- 3. Ensure 'Test Course' exists
    INSERT INTO courses (project_id, course_name, description, start_date, end_date, status)
    VALUES (test_project_id, 'Test Course for Today', 'A course with a lesson scheduled for today', today_date - INTERVAL '1 week', today_date + INTERVAL '1 week', 'In Progress')
    ON CONFLICT (project_id, course_name) DO UPDATE SET course_name = EXCLUDED.course_name -- Assuming course_name per project is unique
    RETURNING course_id INTO test_course_id;

    IF test_course_id IS NULL THEN -- If no unique constraint on (project_id, course_name) this might be tricky
         SELECT c.course_id INTO test_course_id
         FROM courses c
         WHERE c.project_id = test_project_id AND c.course_name = 'Test Course for Today' LIMIT 1;
    END IF;


    -- 4. Ensure 'Expert User' exists
    INSERT INTO users (role_id, first_name, last_name, email, password_hash, is_active)
    VALUES (expert_role_id, 'Expert', 'TestUser', 'expert-today@example.com', '$2a$10$abcdefghijklmnopqrstu.vwxyzABCDEFGHIJKLMONPQRSTU') -- Dummy hash, not used for login here
    ON CONFLICT (email) DO UPDATE SET first_name = EXCLUDED.first_name
    RETURNING user_id INTO expert_user_id;

    IF expert_user_id IS NULL THEN
        SELECT user_id INTO expert_user_id FROM users WHERE email = 'expert-today@example.com';
    END IF;

    -- 5. Ensure 'Expert' entry exists
    INSERT INTO experts (user_id, cv_path, availability)
    VALUES (expert_user_id, '/path/to/cv_today.pdf', 'Available for testing today')
    ON CONFLICT (user_id) DO UPDATE SET cv_path = EXCLUDED.cv_path
    RETURNING expert_id INTO expert_expert_id;

    IF expert_expert_id IS NULL THEN
        SELECT expert_id INTO expert_expert_id FROM experts WHERE user_id = expert_user_id;
    END IF;

    -- 6. Assign Expert to Course (course_experts)
    INSERT INTO course_experts (course_id, expert_id, hourly_cost, payment_status)
    VALUES (test_course_id, expert_expert_id, 50.00, 'Pending')
    ON CONFLICT (course_id, expert_id) DO UPDATE SET hourly_cost = EXCLUDED.hourly_cost
    RETURNING course_expert_id INTO expert_course_expert_id;

    IF expert_course_expert_id IS NULL THEN
        SELECT course_expert_id INTO expert_course_expert_id FROM course_experts WHERE course_id = test_course_id AND expert_id = expert_expert_id;
    END IF;


    -- 7. Insert a Calendar Lesson for Today
    INSERT INTO calendar_lessons (course_id, plesso_id, lesson_title, lesson_description, start_time, end_time, location_details)
    VALUES (
        test_course_id,
        NULL, -- No specific plesso for this test
        'Special Today Lesson',
        'This lesson is scheduled for today to test the dashboard.',
        (today_date + TIME '10:00:00')::timestamp with time zone, -- 10:00 AM today
        (today_date + TIME '11:30:00')::timestamp with time zone, -- 11:30 AM today
        'Room T1'
    )
    RETURNING lesson_id INTO test_lesson_id;

    -- 8. Assign the specific expert to this lesson (lesson_experts)
    INSERT INTO lesson_experts (lesson_id, course_expert_id, notes)
    VALUES (test_lesson_id, expert_course_expert_id, 'Expert assigned for today lesson test.')
    ON CONFLICT (lesson_id, course_expert_id) DO NOTHING;


    RAISE NOTICE 'Sample lesson for today created/verified. SchoolID: %, ProjectID: %, CourseID: %, ExpertUserID: %, ExpertID: %, CourseExpertID: %, LessonID: %',
        test_school_id, test_project_id, test_course_id, expert_user_id, expert_expert_id, expert_course_expert_id, test_lesson_id;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error in sample data script: %', SQLERRM;
END $$;
