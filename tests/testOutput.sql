CREATE SCHEMA IF NOT EXISTS public;

CREATE TABLE public.test_GeneratedTest (
  userId BINARY(16) NOT NULL,
  data JSON NOT NULL,
  test1 VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') VIRTUAL NOT NULL,
  test2 VARCHAR(30) GENERATED ALWAYS AS (data->>'$.test') NOT NULL,
  test3 VARCHAR(30) AS (data->>'$.test') NOT NULL,
  test4 VARCHAR(30) AS (data->>'$.test') NOT NULL,
  PRIMARY KEY (userId)
);
CREATE INDEX TEST4INDEX ON public.test_GeneratedTest (test4 ASC);