const db = require('../config/db');

/**
 * Retrieves lessons scheduled for the current date along with associated details.
 */
async function getTodaysScheduledLessons(req, res) {
  try {
    const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format

    const queryText = `
      SELECT
        cl.lesson_id,
        cl.lesson_title,
        TO_CHAR(cl.start_time, 'HH24:MI') AS lesson_start_time,
        TO_CHAR(cl.end_time, 'HH24:MI') AS lesson_end_time,
        c.course_name,
        p.project_name,
        s.school_name,
        COALESCE(
            STRING_AGG(DISTINCT u_expert.first_name || ' ' || u_expert.last_name, ', '),
            'N/A'
        ) AS expert_names
      FROM calendar_lessons cl
      JOIN courses c ON cl.course_id = c.course_id
      JOIN projects p ON c.project_id = p.project_id
      JOIN schools s ON p.school_id = s.school_id
      LEFT JOIN lesson_experts le ON cl.lesson_id = le.lesson_id
      LEFT JOIN course_experts ce ON le.course_expert_id = ce.course_expert_id
      LEFT JOIN experts exp ON ce.expert_id = exp.expert_id
      LEFT JOIN users u_expert ON exp.user_id = u_expert.user_id
      WHERE DATE(cl.start_time AT TIME ZONE 'UTC') = $1 -- Assuming start_time is stored in UTC
      GROUP BY cl.lesson_id, c.course_name, p.project_name, s.school_name
      ORDER BY cl.start_time;
    `;
    // Note: The AT TIME ZONE 'UTC' might need adjustment based on how timestamps are stored.
    // If they are stored with time zone, DATE(cl.start_time) might be enough if the DB server's timezone is UTC.
    // Or, if stored as local timestamps, ensure the comparison is correct.

    const { rows } = await db.query(queryText, [today]);

    const formattedLessons = rows.map(lesson => ({
      lesson_id: lesson.lesson_id,
      lesson_title: lesson.lesson_title,
      course_title: lesson.course_name, // Corrected from course_title
      project_name: lesson.project_name,
      school_name: lesson.school_name,
      lesson_time: `${lesson.lesson_start_time} - ${lesson.lesson_end_time}`,
      expert_names: lesson.expert_names,
    }));

    res.json(formattedLessons);

  } catch (error) {
    console.error('Error fetching today\'s scheduled lessons:', error);
    res.status(500).json({ message: 'Server error while fetching today\'s lessons.' });
  }
}

module.exports = {
  getTodaysScheduledLessons,
};
