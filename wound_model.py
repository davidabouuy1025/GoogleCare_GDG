import os
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models, regularizers
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
from sklearn.utils.class_weight import compute_class_weight

# =========================
# CONFIG
# =========================
DATASET_PATH = './dataset'
IMG_SIZE = (224, 224)   # safer + faster
BATCH_SIZE = 4          # lower = more stable
EPOCHS_PHASE1 = 8
EPOCHS_PHASE2 = 8

# =========================
# DATA GENERATOR (SAFE AUG)
# =========================
train_datagen = ImageDataGenerator(
    rescale=1./255,
    rotation_range=15,
    width_shift_range=0.1,
    height_shift_range=0.1,
    zoom_range=0.15,
    horizontal_flip=True,
    validation_split=0.2
)

train_generator = train_datagen.flow_from_directory(
    DATASET_PATH,
    target_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='training',
    shuffle=True
)

val_generator = train_datagen.flow_from_directory(
    DATASET_PATH,
    target_size=IMG_SIZE,
    batch_size=BATCH_SIZE,
    class_mode='categorical',
    subset='validation'
)

# Auto-detect number of classes
NUM_CLASSES = train_generator.num_classes

print("Classes:", train_generator.class_indices)

# =========================
# CLASS WEIGHTS (IMPORTANT)
# =========================
class_weights = compute_class_weight(
    class_weight='balanced',
    classes=np.unique(train_generator.classes),
    y=train_generator.classes
)
class_weights = dict(enumerate(class_weights))

print("Class Weights:", class_weights)

# =========================
# MODEL (LIGHT + STRONG)
# =========================
base_model = tf.keras.applications.MobileNetV2(
    input_shape=(*IMG_SIZE, 3),
    include_top=False,
    weights='imagenet'
)

base_model.trainable = False  # freeze first

inputs = tf.keras.Input(shape=(*IMG_SIZE, 3))
x = base_model(inputs, training=False)
x = layers.GlobalAveragePooling2D()(x)
x = layers.BatchNormalization()(x)

x = layers.Dense(256, activation='relu',
        kernel_regularizer=regularizers.l2(0.02))(x)
x = layers.Dropout(0.5)(x)

x = layers.Dense(128, activation='relu',
        kernel_regularizer=regularizers.l2(0.02))(x)
x = layers.Dropout(0.5)(x)

outputs = layers.Dense(NUM_CLASSES, activation='softmax')(x)

model = tf.keras.Model(inputs, outputs)

# =========================
# CALLBACKS
# =========================
callbacks = [
    EarlyStopping(patience=5, restore_best_weights=True, monitor='val_loss'),
    ReduceLROnPlateau(factor=0.3, patience=3, monitor='val_loss'),
    ModelCheckpoint('best_model.keras', save_best_only=True, monitor='val_loss')
]

# =========================
# PHASE 1 - TRAIN HEAD
# =========================
model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-3),
    loss='categorical_crossentropy',
    metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
)

model.fit(
    train_generator,
    epochs=EPOCHS_PHASE1,
    validation_data=val_generator,
    class_weight=class_weights,
    callbacks=callbacks
)

# =========================
# PHASE 2 - FINE TUNE
# =========================
base_model.trainable = True

# Freeze most layers, train last ~10
for layer in base_model.layers[:-10]:
    layer.trainable = False

model.compile(
    optimizer=tf.keras.optimizers.Adam(1e-5),
    loss='categorical_crossentropy',
    metrics=['accuracy', tf.keras.metrics.AUC(name='auc')]
)

model.fit(
    train_generator,
    epochs=EPOCHS_PHASE2,
    validation_data=val_generator,
    class_weight=class_weights,
    callbacks=callbacks
)

# =========================
# SAVE MODEL
# =========================
model.export('wound_classifier_savedmodel')

# =========================
# TFLITE EXPORT (SAFE)
# =========================
converter = tf.lite.TFLiteConverter.from_saved_model('wound_classifier_savedmodel')

converter.optimizations = [tf.lite.Optimize.DEFAULT]
converter.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS,
    tf.lite.OpsSet.SELECT_TF_OPS
]

tflite_model = converter.convert()

with open('wound_classifier.tflite', 'wb') as f:
    f.write(tflite_model)

print("\n✅ DONE: wound_classifier.tflite created successfully!")