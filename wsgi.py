"""Entrée WSGI pour gunicorn (FuelLog autonome).

    gunicorn -w 2 -b 127.0.0.1:8000 "wsgi:app"
"""
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)

from panel import create_app  # noqa: E402

app = create_app()
