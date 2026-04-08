import requests

# 1. The URL of your local FastAPI server
url = "http://127.0.0.1:8000/classify-image/"

# 2. Path to the image you want to test
image_path = "/home/vinh-le/school/hackathon/hackathonhuzz/clip-ai/app/pics/test.jpg"

# 3. Dynamic categories you want the AI to check for
# Try changing these to see how CLIP reacts!
my_hobbies = "hiking in the woods, soldering electronics, playing soccer, baking bread"

print(f"🚀 Sending '{image_path}' to the AI...")

try:
    # 4. Open the image in binary mode ('rb')
    with open(image_path, "rb") as image_file:
        # Prepare the 'multipart/form-data' payload
        files = {"file": (image_path, image_file, "image/jpeg")}
        data = {"categories": my_hobbies}

        # 5. Make the POST request
        response = requests.post(url, files=files, data=data)

    # 6. Check if it worked
    if response.status_code == 200:
        print("✅ Success! Here is what the AI found:")
        results = response.json()
        
        # Print the predictions nicely
        for hobby, score in results["predictions"].items():
            print(f"   - {hobby}: {score}%")
    else:
        print(f"❌ Error {response.status_code}: {response.text}")

except FileNotFoundError:
    print(f"❌ Error: Could not find '{image_path}' in the current folder.")
except requests.exceptions.ConnectionError:
    print("❌ Error: Could not connect to the server. Is main.py running?")