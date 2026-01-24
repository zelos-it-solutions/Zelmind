from django.urls import path
from . import views

urlpatterns = [
    path("", views.loginUser, name="login"),
    path("signup/", views.signUpUser, name="signup"),
    path("home/", views.home, name="home"),
    path("privacy-policy/", views.privacy_policy, name="privacy_policy"),
    path("terms-of-service/", views.terms_of_service, name="terms_of_service"),
]