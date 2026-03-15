import os

import psycopg2
from psycopg2 import Error as PostgresError
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv


load_dotenv()


class DBConnectionWrapper:
    def __init__(self, connection):
        self._connection = connection

    def cursor(self, dictionary=False):
        if dictionary:
            return self._connection.cursor(cursor_factory=RealDictCursor)
        return self._connection.cursor()

    def commit(self):
        return self._connection.commit()

    def rollback(self):
        return self._connection.rollback()

    def close(self):
        return self._connection.close()


def get_db_connection():
    """Creates and returns a PostgreSQL connection compatible with Supabase."""
    database_url = os.getenv("DATABASE_URL")

    try:
        if database_url:
            connection = psycopg2.connect(
                database_url,
                sslmode=os.getenv("DB_SSLMODE", "require"),
            )
        else:
            connection = psycopg2.connect(
                host=os.getenv("DB_HOST", "localhost"),
                port=int(os.getenv("DB_PORT", "5432")),
                user=os.getenv("DB_USER", "postgres"),
                password=os.getenv("DB_PASSWORD", "postgres"),
                dbname=os.getenv("DB_NAME", "safechat_db"),
                sslmode=os.getenv("DB_SSLMODE", "prefer"),
            )

        return DBConnectionWrapper(connection)
    except PostgresError as e:
        print(f"Error connecting to PostgreSQL database: {e}")
        return None
