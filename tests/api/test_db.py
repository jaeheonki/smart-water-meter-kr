# 기존 SQLite 스키마를 반복 안전하게 확장하는 DB 초기화 테스트

from sqlmodel import create_engine

from src.api.db import create_db_and_tables


def test_create_db_and_tables_adds_baseline_column_to_legacy_reading_table(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'legacy.db'}")
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "CREATE TABLE reading (id INTEGER PRIMARY KEY, reading_m3 FLOAT NOT NULL)"
        )

    create_db_and_tables(engine)
    create_db_and_tables(engine)

    with engine.connect() as connection:
        columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(reading)")
        }

    assert "is_baseline" in columns
