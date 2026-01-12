import threading
import time
import logging
from django.conf import settings
from home_page.services.notification_service import check_and_send_reminders, check_and_send_morning_briefings

logger = logging.getLogger(__name__)

class ReminderWorker:
    _instance = None
    _thread = None
    _stop_event = threading.Event()

    @classmethod
    def start(cls):
        if cls._thread is None or not cls._thread.is_alive():
            cls._stop_event.clear()
            cls._thread = threading.Thread(target=cls._run_loop, daemon=True)
            cls._thread.start()
            logger.info("Reminder background worker started.")

    @classmethod
    def stop(cls):
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=5)
            logger.info("Reminder background worker stopped.")

    @classmethod
    def _run_loop(cls):
        logger.info("Reminder worker loop running...")
        while not cls._stop_event.is_set():
            try:
                # Run the checks
                check_and_send_reminders()
                check_and_send_morning_briefings()
            except Exception as e:
                logger.error(f"Error in reminder worker loop: {e}", exc_info=True)
            
            # Sleep for 60 seconds (or less if stopped)
            # Use wait() to be responsive to stop event
            if cls._stop_event.wait(60):
                break
