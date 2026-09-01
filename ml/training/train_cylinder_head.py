"""
Training Script for CylinderHeadML
Fits actual RandomForest model on synthetic dataset and saves joblib artifact + metadata.
"""

from ml.training.train_all import train_all_models

def train_cylinder_head():
    train_all_models()

if __name__ == "__main__":
    train_cylinder_head()
