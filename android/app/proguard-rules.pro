# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Keep React Native classes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Keep Android lifecycle components
-keep class androidx.lifecycle.** { *; }
-keep class android.app.Activity { *; }

# Keep Gson
-keep class com.google.gson.** { *; }
-keepclassmembers class ** {
  @com.google.gson.annotations.SerializedName <fields>;
}

# Keep our app classes and native modules
-keep class com.anonymous.KDS.** { *; }
-keep class **$$ { *; }
-keep class **$InjectViewState { *; }

# Keep all native methods
-keepclasseswithmembernames class * {
  native <methods>;
}

# Keep native methods and their implementations
-keepclasseswithmembers,includedescriptorclasses class * {
  *** *(...);
}

# Remove logging in release builds
-assumenosideeffects class android.util.Log {
  public static *** d(...);
  public static *** v(...);
  public static *** i(...);
  public static *** w(...);
}

# Keep BouncyCastle and JNDI classes (required for SSL/TLS)
-keep class org.bouncycastle.** { *; }
-keep class javax.naming.** { *; }
-keep class javax.naming.directory.** { *; }
-dontwarn javax.naming.**
-dontwarn org.bouncycastle.**

# Add any project specific keep options here:
