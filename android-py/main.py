# -*- coding: utf-8 -*-
"""
تطبيق أندرويد بلغة بايثون (Python / Kivy Ready + SQLite Offline Storage)
نظام المنافذ والجوازات الذكي - الجمهورية اليمنية (المركز الرئيسي: صنعاء)
يدعم العمل كواجهة Kivy للأندرويد عند توفر مكتبة kivy، أو وضع الطرفية المباشر للاختبار.
"""

import json
import sqlite3
import datetime
import os


class OfflineBorderDatabase:
    def __init__(self, db_path="yemen_borders_offline.db"):
        self.db_path = db_path
        self.conn = sqlite3.connect(self.db_path)
        self._init_tables()

    def _init_tables(self):
        cur = self.conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS travelers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                passport_number TEXT UNIQUE,
                full_name TEXT NOT NULL,
                nationality TEXT DEFAULT 'اليمن',
                expiry_date TEXT,
                travel_allowed TEXT DEFAULT 'نعم',
                port_name TEXT DEFAULT 'المركز الرئيسي - العاصمة صنعاء',
                created_at TEXT
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS watchlist_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                passport_number TEXT,
                target_name TEXT,
                status TEXT DEFAULT 'جديد'
            )
        """)
        self.conn.commit()

    def upsert_traveler(self, passport_no, full_name, nationality="اليمن", expiry_date="2032-01-01", port="مطار صنعاء الدولي"):
        cur = self.conn.cursor()
        now = datetime.datetime.now().isoformat()
        cur.execute("""
            INSERT INTO travelers (passport_number, full_name, nationality, expiry_date, port_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(passport_number) DO UPDATE SET
                full_name=excluded.full_name,
                nationality=excluded.nationality,
                expiry_date=excluded.expiry_date,
                port_name=excluded.port_name
        """, (passport_no, full_name, nationality, expiry_date, port, now))
        self.conn.commit()

    def check_watchlist_and_expiry(self, passport_no, full_name):
        cur = self.conn.cursor()
        cur.execute("""
            SELECT title, status FROM watchlist_reports
            WHERE passport_number = ? OR target_name LIKE ?
        """, (passport_no, f"%{full_name}%"))
        matched = cur.fetchone()

        cur.execute("SELECT expiry_date FROM travelers WHERE passport_number = ?", (passport_no,))
        row = cur.fetchone()
        today = datetime.date.today().isoformat()
        is_expired = bool(row and row[0] and row[0] < today)

        return {
            "passport": passport_no,
            "name": full_name,
            "hq": "المركز الرئيسي - العاصمة صنعاء",
            "watchlist_match": bool(matched),
            "matched_report": matched[0] if matched else None,
            "is_expired": is_expired,
            "decision": "ممنوع من السفر - ضبط فوري" if (matched or is_expired) else "سليم ومسموح بالعبور",
            "checked_at": datetime.datetime.now().isoformat(),
        }


def run_app():
    db = OfflineBorderDatabase()
    db.upsert_traveler("P12345678", "أحمد علي محمد", "اليمن", "2032-06-15", "مطار صنعاء الدولي")
    result = db.check_watchlist_and_expiry("P12345678", "أحمد علي محمد")

    try:
        from kivy.app import App
        from kivy.uix.boxlayout import BoxLayout
        from kivy.uix.label import Label
        from kivy.uix.textinput import TextInput
        from kivy.uix.button import Button

        class BorderKivyApp(App):
            def build(self):
                layout = BoxLayout(orientation="vertical", padding=20, spacing=12)
                layout.add_widget(Label(text="نظام المنافذ والجوازات الذكي - المركز الرئيسي صنعاء", font_size="18sp"))
                self.passport_input = TextInput(hint_text="رقم الجواز", multiline=False)
                self.name_input = TextInput(hint_text="اسم المسافر", multiline=False)
                self.status_label = Label(text="أدخل بيانات الجواز للتحقق الفوري (SQLite Offline)")
                btn = Button(text="تحقق من الجواز والمطلوبين", size_hint=(1, 0.3))
                btn.bind(on_press=self.on_verify)
                layout.add_widget(self.passport_input)
                layout.add_widget(self.name_input)
                layout.add_widget(btn)
                layout.add_widget(self.status_label)
                return layout

            def on_verify(self, _instance):
                res = db.check_watchlist_and_expiry(self.passport_input.text.strip(), self.name_input.text.strip())
                self.status_label.text = f"{res['decision']} | مطلوب: {res['watchlist_match']}"

        BorderKivyApp().run()
    except ImportError:
        print("[*] Kivy غير مثبتة في بيئة الخادم - تم التشغيل في وضع الاختبار المباشر مع قاعدة SQLite المحلية:")
        print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    run_app()
