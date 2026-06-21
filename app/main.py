import random
import string
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field

from .database import engine, Base, get_db, SessionLocal
from . import models

# Initialize Database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="KisanDhan - Direct Farmer Marketplace",
    description="An app for Indian farmers to sell products directly to consumers in INR with regional language support.",
    version="1.0.0"
)

# Enable CORS for local testing/development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Schemas ---

class FarmerCreate(BaseModel):
    govt_farmer_id: str = Field(..., description="Government Generated Farmer ID card number", min_length=4, max_length=50)
    name: str
    phone: str
    bank_name: str
    account_number: str
    ifsc_code: str

class FarmerResponse(BaseModel):
    govt_farmer_id: str
    name: str
    phone: str
    bank_name: str
    account_number: str
    ifsc_code: str
    balance: float

    class Config:
        from_attributes = True

class ProductCreate(BaseModel):
    farmer_id: str
    title: str
    category: str
    price: float = Field(..., gt=0, description="Price in INR")
    unit: str  # e.g., "kg", "dozen", "quintal"
    stock: float = Field(..., ge=0)
    image_url: Optional[str] = None
    description: Optional[str] = None

class ProductResponse(BaseModel):
    id: int
    farmer_id: str
    title: str
    category: str
    price: float
    unit: str
    stock: float
    image_url: Optional[str]
    description: Optional[str]
    farmer_name: Optional[str] = None

    class Config:
        from_attributes = True

class CheckoutItem(BaseModel):
    product_id: int
    quantity: float

class CheckoutRequest(BaseModel):
    buyer_name: str
    buyer_phone: str
    items: List[CheckoutItem]

class TransactionResponse(BaseModel):
    id: int
    product_title: str
    farmer_name: str
    buyer_name: str
    amount: float
    platform_fee: float
    farmer_share: float
    status: str
    created_at: str

# Helper to generate mock transaction references
def generate_txn_ref():
    return "TXN-UPI-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=12))

# --- Startup Population Event ---
@app.on_event("startup")
def startup_populate():
    db = SessionLocal()
    try:
        if db.query(models.Farmer).count() == 0:
            # Pre-load a few mock farmers with standard Government-generated Farmer IDs
            f1 = models.Farmer(
                govt_farmer_id="FARM-IN-2026-8891",
                name="Rajesh Kumar",
                phone="9876543210",
                bank_name="State Bank of India",
                account_number="30918239081",
                ifsc_code="SBIN0001234",
                balance=14250.0
            )
            f2 = models.Farmer(
                govt_farmer_id="FARM-IN-2026-1042",
                name="Ananya Patil",
                phone="9123456789",
                bank_name="Bank of Baroda",
                account_number="104298712345",
                ifsc_code="BARB0MUMBAI",
                balance=7600.0
            )
            db.add_all([f1, f2])
            db.commit()
            db.refresh(f1)
            db.refresh(f2)

            # Pre-load initial organic products
            products = [
                models.Product(
                    farmer_id=f1.govt_farmer_id,
                    title="Organic Basmati Rice",
                    category="Grains",
                    price=95.0,
                    unit="kg",
                    stock=400.0,
                    image_url="https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&q=80&w=400",
                    description="Pure, aromatic, long-grain Basmati rice grown using natural organic manure in Punjab."
                ),
                models.Product(
                    farmer_id=f1.govt_farmer_id,
                    title="Fresh Shimla Apples",
                    category="Fruits",
                    price=180.0,
                    unit="kg",
                    stock=120.0,
                    image_url="https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&q=80&w=400",
                    description="Naturally sweet and crispy apples harvested directly from our orchards in Shimla."
                ),
                models.Product(
                    farmer_id=f2.govt_farmer_id,
                    title="Farm Fresh Potatoes",
                    category="Vegetables",
                    price=30.0,
                    unit="kg",
                    stock=800.0,
                    image_url="https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&q=80&w=400",
                    description="Soil-fresh nutritious potatoes directly from fields, excellent for everyday cooking."
                ),
                models.Product(
                    farmer_id=f2.govt_farmer_id,
                    title="Organic Turmeric Powder",
                    category="Spices",
                    price=260.0,
                    unit="kg",
                    stock=95.0,
                    image_url="https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&q=80&w=400",
                    description="Sun-dried and stone-ground turmeric root containing high levels of healthy curcumin."
                )
            ]
            db.add_all(products)

            # Pre-load transaction logs to look rich on first load
            t1 = models.Transaction(
                product_id=1,
                buyer_name="Vikram Sharma",
                buyer_phone="9876598765",
                amount=950.0,  # 10 kg rice
                platform_fee=47.5,
                farmer_share=902.5,
                status="completed"
            )
            t2 = models.Transaction(
                product_id=3,
                buyer_name="Priya Patel",
                buyer_phone="9988776655",
                amount=300.0,  # 10 kg potatoes
                platform_fee=15.0,
                farmer_share=285.0,
                status="completed"
            )
            db.add_all([t1, t2])
            db.commit()
    except Exception as e:
        print("Populate error:", e)
    finally:
        db.close()

# --- API Endpoints ---

# 1. Farmer Registration & Query
@app.post("/api/farmers", response_model=FarmerResponse, status_code=201)
def register_farmer(farmer: FarmerCreate, db: Session = Depends(get_db)):
    db_farmer = db.query(models.Farmer).filter(models.Farmer.govt_farmer_id == farmer.govt_farmer_id).first()
    if db_farmer:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Farmer with this Government ID is already registered."
        )
    new_farmer = models.Farmer(
        govt_farmer_id=farmer.govt_farmer_id,
        name=farmer.name,
        phone=farmer.phone,
        bank_name=farmer.bank_name,
        account_number=farmer.account_number,
        ifsc_code=farmer.ifsc_code,
        balance=0.0
    )
    db.add(new_farmer)
    db.commit()
    db.refresh(new_farmer)
    return new_farmer

@app.get("/api/farmers", response_model=List[FarmerResponse])
def get_farmers(db: Session = Depends(get_db)):
    return db.query(models.Farmer).all()

@app.get("/api/farmers/{govt_farmer_id}", response_model=FarmerResponse)
def get_farmer_details(govt_farmer_id: str, db: Session = Depends(get_db)):
    farmer = db.query(models.Farmer).filter(models.Farmer.govt_farmer_id == govt_farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
    return farmer

# 2. Product Management
@app.get("/api/products", response_model=List[ProductResponse])
def get_products(category: Optional[str] = None, search: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Product, models.Farmer.name.label("farmer_name")).join(
        models.Farmer, models.Product.farmer_id == models.Farmer.govt_farmer_id
    )
    if category:
        query = query.filter(models.Product.category == category)
    if search:
        query = query.filter(models.Product.title.ilike(f"%{search}%"))
    
    results = query.all()
    out = []
    for product, farmer_name in results:
        res = ProductResponse.from_orm(product)
        res.farmer_name = farmer_name
        out.append(res)
    return out

@app.post("/api/products", response_model=ProductResponse, status_code=201)
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    # Validate farmer ID exists
    farmer = db.query(models.Farmer).filter(models.Farmer.govt_farmer_id == product.farmer_id).first()
    if not farmer:
        raise HTTPException(
            status_code=400,
            detail="Cannot add product. Government Farmer ID not registered."
        )
    
    new_product = models.Product(
        farmer_id=product.farmer_id,
        title=product.title,
        category=product.category,
        price=product.price,
        unit=product.unit,
        stock=product.stock,
        image_url=product.image_url or "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?auto=format&fit=crop&q=80&w=400",
        description=product.description
    )
    db.add(new_product)
    db.commit()
    db.refresh(new_product)
    
    # Return mapping back
    response_data = ProductResponse.from_orm(new_product)
    response_data.farmer_name = farmer.name
    return response_data

# 3. Checkout (Direct settlement simulation)
@app.post("/api/checkout")
def checkout(request: CheckoutRequest, db: Session = Depends(get_db)):
    if not request.items:
        raise HTTPException(status_code=400, detail="Cart is empty")
    
    total_amount = 0.0
    total_fee = 0.0
    total_credited = 0.0
    settlement_details = []
    
    # Process items in the cart
    for item in request.items:
        product = db.query(models.Product).filter(models.Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")
        if product.stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.title}. Available: {product.stock} {product.unit}"
            )
        
        # Deduct stock
        product.stock -= item.quantity
        
        # Calculate pricing details
        item_cost = product.price * item.quantity
        platform_fee = item_cost * 0.05  # 5% Platform fee
        net_farmer_share = item_cost - platform_fee
        
        total_amount += item_cost
        total_fee += platform_fee
        total_credited += net_farmer_share
        
        # Find farmer to credit account directly
        farmer = db.query(models.Farmer).filter(models.Farmer.govt_farmer_id == product.farmer_id).first()
        if farmer:
            farmer.balance += net_farmer_share
            
        # Log Transaction
        txn = models.Transaction(
            product_id=product.id,
            buyer_name=request.buyer_name,
            buyer_phone=request.buyer_phone,
            amount=item_cost,
            platform_fee=platform_fee,
            farmer_share=net_farmer_share,
            status="completed"
        )
        db.add(txn)
        
        settlement_details.append({
            "product_title": product.title,
            "farmer_name": farmer.name if farmer else "Unknown Farmer",
            "bank_name": farmer.bank_name if farmer else "N/A",
            "account_number": f"******{farmer.account_number[-4:]}" if farmer else "N/A",
            "ifsc": farmer.ifsc_code if farmer else "N/A",
            "gross_amount_inr": item_cost,
            "platform_fee_inr": platform_fee,
            "net_credited_inr": net_farmer_share
        })
        
    db.commit()
    
    return {
        "status": "success",
        "buyer_name": request.buyer_name,
        "payment_gateway_ref": generate_txn_ref(),
        "gross_amount_inr": total_amount,
        "platform_fee_inr": total_fee,
        "net_credited_to_farmers_inr": total_credited,
        "settlements": settlement_details
    }

# 4. View transaction ledger
@app.get("/api/transactions", response_model=List[TransactionResponse])
def get_transactions(farmer_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(
        models.Transaction,
        models.Product.title.label("product_title"),
        models.Farmer.name.label("farmer_name"),
        models.Product.farmer_id.label("farmer_id")
    ).join(
        models.Product, models.Transaction.product_id == models.Product.id
    ).join(
        models.Farmer, models.Product.farmer_id == models.Farmer.govt_farmer_id
    )
    
    if farmer_id:
        query = query.filter(models.Product.farmer_id == farmer_id)
        
    results = query.order_by(models.Transaction.id.desc()).all()
    out = []
    for txn, product_title, farmer_name, f_id in results:
        out.append(TransactionResponse(
            id=txn.id,
            product_title=product_title,
            farmer_name=farmer_name,
            buyer_name=txn.buyer_name,
            amount=txn.amount,
            platform_fee=txn.platform_fee,
            farmer_share=txn.farmer_share,
            status=txn.status,
            created_at=txn.created_at.strftime("%Y-%m-%d %H:%M:%S")
        ))
    return out

# Serve Static files for Front-End UI
app.mount("/", StaticFiles(directory="app/static", html=True), name="static")
