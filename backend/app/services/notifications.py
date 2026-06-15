"""
notifications.py — Firebase Cloud Messaging (FCM) push notification helper.
Used by backup_match.py (Phase 2) and emergency alert (Krithika's scope).
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# firebase_admin is initialised once in main.py via firebase_admin.initialize_app()
# We import messaging here; it will only work after the app is initialised.
try:
    from firebase_admin import messaging
    FCM_AVAILABLE = True
except ImportError:
    FCM_AVAILABLE = False
    logger.warning("firebase_admin not installed — FCM push notifications disabled.")


def send_push(
    fcm_token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> bool:
    """
    Send a Firebase Cloud Messaging push notification to a single device.

    Args:
        fcm_token: The recipient device's FCM registration token.
        title:     Notification title (shown in system tray).
        body:      Notification body text.
        data:      Optional key→value dict of extra payload data sent to the app.

    Returns:
        True if the message was sent successfully, False otherwise.
    """
    if not FCM_AVAILABLE:
        logger.warning("FCM not available. Skipping push to token %s", fcm_token[:20])
        return False

    if not fcm_token:
        logger.warning("send_push called with empty fcm_token — skipping.")
        return False

    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body,
            ),
            token=fcm_token,
            data={k: str(v) for k, v in (data or {}).items()},  # FCM requires string values
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(
                    sound="default",
                    click_action="FLUTTER_NOTIFICATION_CLICK",
                ),
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(sound="default"),
                ),
            ),
        )
        response = messaging.send(message)
        logger.info("FCM push sent. Message ID: %s", response)
        return True

    except messaging.UnregisteredError:
        logger.warning("FCM token is unregistered (device uninstalled app?): %s", fcm_token[:20])
        return False
    except messaging.InvalidArgumentError as exc:
        logger.error("FCM invalid argument: %s", exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("FCM send failed: %s", exc)
        return False


def send_backup_ride_notification(fcm_token: str, driver_name: str, departure_time: str) -> bool:
    """Convenience wrapper for the backup-match reassignment push."""
    return send_push(
        fcm_token=fcm_token,
        title="🚗 Backup Ride Found!",
        body=f"Your driver cancelled. We found you a new ride! Driver: {driver_name} · Departs {departure_time}",
        data={"type": "backup_ride_assigned"},
    )


def send_no_backup_notification(fcm_token: str) -> bool:
    """Notify a stranded rider when no backup ride could be found."""
    return send_push(
        fcm_token=fcm_token,
        title="😔 No Backup Available",
        body="Your driver cancelled and no nearby rides are available right now. Please check the app for alternatives.",
        data={"type": "no_backup_found"},
    )