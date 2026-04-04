# Wound Classification Model Reference (Python)
# This is a reference script for training a custom wound classification model.
# In the live application, we use Gemini Vision for real-time analysis.

import os
import tensorflow as tf
from tensorflow.keras import layers, models
from tensorflow.keras.preprocessing.image import ImageDataGenerator

# 1. Setup Dataset Paths
# Create a folder structure like:
# /dataset
#   /burn
#   /cut
#   /infection
#   /ulcer
DATASET_PATH = './dataset'

# 2. Data Augmentation
train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=20,
    width_shift_range=0.2,
    height_shift_range=0.2,
    shear_range=0.2,
    zoom_range=0.2,
    horizontal_flip=True,
    validation_split=0.2
)

train_generator = train_datagen.flow_from_directory(
    DATASET_PATH,
    target_size=(224, 224),
    batch_size=32,
    class_mode='categorical',
    subset='training'
)

validation_generator = train_datagen.flow_from_directory(
    DATASET_PATH,
    target_size=(224, 224),
    batch_size=32,
    class_mode='categorical',
    subset='validation'
)

# 3. Build Model (Transfer Learning with MobileNetV2)
base_model = tf.keras.applications.MobileNetV2(input_shape=(224, 224, 3), include_top=False, weights='imagenet')
base_model.trainable = False

model = models.Sequential([
    base_model,
    layers.GlobalAveragePooling2D(),
    layers.Dense(128, activation='relu'),
    layers.Dropout(0.2),
    layers.Dense(4, activation='softmax') # 4 classes: Burn, Cut, Infection, Ulcer
])

model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

# 4. Train Model
model.fit(train_generator, epochs=10, validation_data=validation_generator)

# 5. Save Model
model.save('wound_classifier_model.h5')

print("Model training script initialized. Please populate the /dataset folder with images to train.")
