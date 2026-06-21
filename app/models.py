from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class Farmer(Base):
    __tablename__ = "farmers"

    # User commented: "farmer id is the government generated farmer id"
    govt_farmer_id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    phone = Column(String)
    bank_name = Column(String)
    account_number = Column(String)
    ifsc_code = Column(String)
    balance = Column(Float, default=0.0)  # Total net earnings credited directly to their bank account

    products = relationship("Product", back_populates="farmer")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    farmer_id = Column(String, ForeignKey("farmers.govt_farmer_id"))
    title = Column(String, index=True)
    category = Column(String)
    price = Column(Float)  # Price in INR (₹)
    unit = Column(String)  # e.g., "kg", "quintal", "dozen"
    stock = Column(Float)  # Quantity in stock
    image_url = Column(String, nullable=True)
    description = Column(String, nullable=True)

    farmer = relationship("Farmer", back_populates="products")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    buyer_name = Column(String)
    buyer_phone = Column(String)
    amount = Column(Float)  # Total transaction value in INR (₹)
    platform_fee = Column(Float)  # Platform fee deducted (5%)
    farmer_share = Column(Float)  # Amount directly credited to Farmer (95%)
    status = Column(String, default="completed")  # "completed", "failed"
    created_at = Column(DateTime, default=datetime.utcnow)
