-- ============================================================
-- MCA Course Data Integration
-- Safe insertion of MCA classrooms and timetable
-- ============================================================

-- Step 1: Insert MCA Classrooms (6 new rooms)
INSERT INTO classrooms (room_number, building, floor, department, semester, section, capacity, facilities, status)
VALUES
('202', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-A', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant'),
('203', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-A', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant'),
('204', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-A', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant'),
('205', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-A', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant'),
('208', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-A', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant'),
('209', 'Ramanujacharya Block', '1st Floor', 'MCA', '2nd', 'MCA-B', 60, 'Projector, Whiteboard, Wi-Fi', 'vacant');

-- Step 2: Create temporary table for MCA schedule
CREATE TEMPORARY TABLE tmp_mca_schedule (
  room_number VARCHAR(10),
  day         ENUM('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'),
  start_time  TIME,
  end_time    TIME,
  subject     VARCHAR(100),
  section     VARCHAR(20),
  semester    VARCHAR(10)
);

-- Step 3: Insert MCA timetable into temporary table
INSERT INTO tmp_mca_schedule (room_number, day, start_time, end_time, subject, section, semester) VALUES
-- MONDAY
('208','Monday','11:30','12:30','WAD','MCA-A','2nd'),
('208','Monday','12:30','13:30','JAVA','MCA-A','2nd'),
('208','Monday','14:30','15:30','SE','MCA-A','2nd'),
('208','Monday','15:30','16:30','MLDAP','MCA-A','2nd'),
-- TUESDAY
('208','Tuesday','09:00','10:00','MLDAP','MCA-A','2nd'),
('208','Tuesday','10:00','11:00','SE','MCA-A','2nd'),
('208','Tuesday','11:30','12:30','WAD','MCA-A','2nd'),
('208','Tuesday','12:30','13:30','JAVA','MCA-A','2nd'),
('208','Tuesday','14:30','15:30','DSA','MCA-A','2nd'),
('208','Tuesday','15:30','16:30','JAVA','MCA-A','2nd'),
-- WEDNESDAY
('208','Wednesday','09:00','10:00','JAVA','MCA-A','2nd'),
('208','Wednesday','11:30','12:30','SE','MCA-A','2nd'),
('208','Wednesday','12:30','13:30','WAD','MCA-A','2nd'),
-- THURSDAY
('208','Thursday','09:00','10:00','WAD','MCA-A','2nd'),
('208','Thursday','10:00','11:00','DSA','MCA-A','2nd'),
('208','Thursday','11:30','12:30','MLDAP','MCA-A','2nd'),
('208','Thursday','12:30','13:30','JAVA','MCA-A','2nd'),
-- FRIDAY
('208','Friday','09:00','10:00','DSA','MCA-A','2nd'),
('208','Friday','10:00','11:00','JAVA','MCA-A','2nd'),
('208','Friday','11:30','12:30','SE','MCA-A','2nd');

-- Step 4: Insert into schedules table with proper room_id mapping
INSERT INTO schedules (room_id, room_number, day, start_time, end_time, subject, section, semester)
SELECT c.id, t.room_number, t.day, t.start_time, t.end_time, t.subject, t.section, t.semester
FROM tmp_mca_schedule t
JOIN classrooms c ON c.room_number = t.room_number;

-- Step 5: Clean up temporary table
DROP TEMPORARY TABLE tmp_mca_schedule;

-- Confirmation message
SELECT 'MCA data successfully integrated!' as status;
