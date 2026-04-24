import cv2

def verify_camera_stream(stream_url: str, timeout_seconds: int = 5) -> bool:
    """
    Verifies if a camera stream is actively responding.
    Used by agents to pre-flight node activations.
    """
    try:
        cap = cv2.VideoCapture(stream_url)
        cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, timeout_seconds * 1000)
        ret, _ = cap.read()
        cap.release()
        return ret
    except Exception as e:
        print(f"[CAMERA_TOOL] Stream verification failed for {stream_url}: {e}")
        return False
