# Zelmind

**Zelmind** is an intelligent AI-powered personal assistant designed to streamline your time management. It helps you schedule events, manage your calendar, and ensures you never miss a beat with smart reminders sent directly to your WhatsApp, Email, or SMS.

## 🚀 Features

-   **Natural Language Scheduling**: Chat with Zelmind to create, update, or find events in your calendar (e.g., "Schedule a meeting with John tomorrow at 2 PM").
-   **Multi-Channel Reminders**: Get notified where you are most active—WhatsApp, SMS (via Twilio), or Email.
-   **Google Calendar Sync**: Seamless two-way integration with Google Calendar.
-   **Smart Recurring Events**: Handles complex recurring schedules (daily, weekly, custom intervals).
-   **User-Friendly Dashboard**: A clean, modern interface to view recent conversations and manage tasks.
-   **Secure Authentication**: Google Sign-In integration for easy and secure access.

## 🛠 Tech Stack

-   **Backend Framework**: Django 5.2 (Python)
-   **Database**: PostgreSQL (Production) / SQLite (Development)
-   **AI & NLP**: Anthropic Claude 3.5 Sonnet / OpenAI GPT-4o
-   **Integrations**:
    -   **Twilio API**: For WhatsApp and SMS notifications.
    -   **Google Calendar API**: For event management.
    -   **SendGrid / SMTP**: For email capabilities.
-   **Hosting**: Configured for deployment on **Railway**, **Render**, or **Heroku**.

## ⚙️ Installation & Setup

1.  **Clone the Repository**
    ```bash
    git clone https://github.com/yourusername/zelmind.git
    cd zelmind
    ```

2.  **Create a Virtual Environment**
    ```bash
    python -m venv virtual
    source virtual/bin/activate  # On Windows: virtual\Scripts\activate
    ```

3.  **Install Dependencies**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables**
    Create a `.env` file in the root directory and add the following:
    ```env
    SECRET_KEY=your_secret_key
    DEBUG=True
    ALLOWED_HOSTS=127.0.0.1,localhost
    
    # AI Keys
    OPENAI_API_KEY=sk-...
    CLAUDE_API_KEY=sk-...
    
    # Graphic/Social
    SOCIAL_AUTH_GOOGLE_OAUTH2_KEY=...
    SOCIAL_AUTH_GOOGLE_OAUTH2_SECRET=...
    
    # Twilio (WhatsApp/SMS)
    TWILIO_ACCOUNT_SID=...
    TWILIO_AUTH_TOKEN=...
    TWILIO_PHONE_NUMBER=...
    ```

5.  **Run Migrations**
    ```bash
    python manage.py migrate
    ```

6.  **Start the Development Server**
    ```bash
    python manage.py runserver
    ```
    Visit `http://127.0.0.1:8000` in your browser.

## 🚀 Deployment

This project is production-ready.
-   **Procfile** included for Gunicorn support.
-   **WhiteNoise** configured for static file serving.
-   **Dependencies** listed in `requirements.txt`.

Refer to your hosting provider's documentation (Railway, Render, etc.) to push and deploy.
