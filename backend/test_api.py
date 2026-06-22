import requests

print("Pinging backend...")
try:
    r = requests.get("http://localhost:8000/health")
    print(r.json())
except Exception as e:
    print(e)
