-- The name of the room a session was played in (#89), kept on each session:
-- there is no room table to hold it. Null = the default ("<host>'s room").
ALTER TABLE "game_session_log" ADD COLUMN "room_name" VARCHAR(60);
