import secrets
import string


def generate_forwarding_address(domain: str) -> str:
    """8文字のランダム英数字でu_{token}@{domain}形式のアドレスを生成"""
    alphabet = string.ascii_lowercase + string.digits
    token = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"u_{token}@{domain}"
