from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from transformers import CLIPProcessor, CLIPModel
import torch
import io

# ==========================================
# 1. THE AI SERVICE (The "Brain")
# ==========================================
class HobbyClassifier:
    def __init__(self):
        print("🚀 Loading CLIP Model into memory...")
        self.model_id = "openai/clip-vit-base-patch32"
        self.model = CLIPModel.from_pretrained(self.model_id)
        self.processor = CLIPProcessor.from_pretrained(self.model_id)
        print("✅ AI Engine is ready!")

    def predict(self, image_bytes, category_string):
        # Convert raw bytes from the request into a PIL Image
        image = Image.open(io.BytesIO(image_bytes))

        # Convert the comma-separated string from the frontend into a list
        # e.g. "hiking, coding, gym" -> ["hiking", "coding", "gym"]
        categories = [c.strip() for c in category_string.split(",") if c.strip()]

        # Run the CLIP Matchmaking logic
        inputs = self.processor(text=categories, images=image, return_tensors="pt", padding=True)
        
        with torch.no_grad():
            outputs = self.model(**inputs)
        
        # Calculate the percentages (Softmax)
        logits_per_image = outputs.logits_per_image 
        probs = logits_per_image.softmax(dim=1)[0] 

        # Build a clean dictionary of results
        results = {}
        for i, prob in enumerate(probs):
            results[categories[i]] = round(prob.item() * 100, 1)

        # Sort so the highest percentage is first
        return dict(sorted(results.items(), key=lambda item: item[1], reverse=True))

# ==========================================
# 2. THE API ROUTES (The "Waiter")
# ==========================================
app = FastAPI()

# CRITICAL: This allows your React Native app to talk to your laptop
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize the classifier once
classifier = HobbyClassifier()

@app.get("/")
async def root():
    return {"message": "Hobby Classification API is running!"}

@app.post("/classify-image/")
async def classify_image(
    file: UploadFile = File(...),
    categories: str = Form("hiking, electronics, sports, cooking, gaming")
):
    # Read the file data sent by the phone
    image_data = await file.read()
    
    # Send it to our AI Service
    predictions = classifier.predict(image_data, categories)
    
    return {
        "filename": file.filename,
        "predictions": predictions
    }