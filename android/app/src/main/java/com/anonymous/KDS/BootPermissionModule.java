package com.anonymous.KDS;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

public class BootPermissionModule extends ReactContextBaseJavaModule {
  public BootPermissionModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "BootPermissionModule";
  }

  @ReactMethod
  public void checkBootAutoStartStatus(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      String packageName = context.getPackageName();

      WritableMap result = Arguments.createMap();
      result.putString("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
      result.putString("brand", Build.BRAND == null ? "" : Build.BRAND);
      result.putInt("sdkInt", Build.VERSION.SDK_INT);

      boolean hasBootPermissionDeclared = false;
      PackageManager pm = context.getPackageManager();
      PackageInfo packageInfo = pm.getPackageInfo(packageName, PackageManager.GET_PERMISSIONS);
      if (packageInfo.requestedPermissions != null) {
        for (String permission : packageInfo.requestedPermissions) {
          if ("android.permission.RECEIVE_BOOT_COMPLETED".equals(permission)) {
            hasBootPermissionDeclared = true;
            break;
          }
        }
      }
      result.putBoolean("hasBootPermissionDeclared", hasBootPermissionDeclared);

      boolean isIgnoringBatteryOptimizations = true;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        PowerManager powerManager = (PowerManager) context.getSystemService(ReactApplicationContext.POWER_SERVICE);
        if (powerManager != null) {
          isIgnoringBatteryOptimizations = powerManager.isIgnoringBatteryOptimizations(packageName);
        }
      }
      result.putBoolean("isIgnoringBatteryOptimizations", isIgnoringBatteryOptimizations);

      // Android 没有统一公开 API 能直接判断"自启动开关"是否打开
      result.putBoolean("autoStartPermissionCheckSupported", false);

      promise.resolve(result);
    } catch (Exception e) {
      promise.reject("CHECK_BOOT_STATUS_ERROR", e);
    }
  }

  @ReactMethod
  public void openAutoStartSettings(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      String packageName = context.getPackageName();

      // 常见 ROM 自启动管理页面，按顺序尝试
      Intent[] intents = new Intent[] {
        // Xiaomi/Redmi
        new Intent().setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        // OPPO/realme/OnePlus (部分版本)
        new Intent().setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        new Intent().setClassName("com.oplus.safecenter", "com.oplus.safecenter.permission.startup.StartupAppListActivity"),
        // vivo/iQOO
        new Intent().setClassName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"),
        new Intent().setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        // Huawei/Honor
        new Intent().setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        // Samsung (应用详情兜底前的尝试)
        new Intent().setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
          .setData(Uri.parse("package:" + packageName))
      };

      boolean launched = false;
      for (Intent intent : intents) {
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (intent.resolveActivity(context.getPackageManager()) != null) {
          context.startActivity(intent);
          launched = true;
          break;
        }
      }

      if (!launched) {
        Intent fallbackIntent = new Intent(Settings.ACTION_SETTINGS);
        fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(fallbackIntent);
      }

      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("OPEN_AUTOSTART_SETTINGS_ERROR", e);
    }
  }

  @ReactMethod
  public void openBatteryOptimizationSettings(Promise promise) {
    try {
      ReactApplicationContext context = getReactApplicationContext();
      Intent intent;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
      } else {
        intent = new Intent(Settings.ACTION_SETTINGS);
      }
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      context.startActivity(intent);
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("OPEN_BATTERY_SETTINGS_ERROR", e);
    }
  }
}
