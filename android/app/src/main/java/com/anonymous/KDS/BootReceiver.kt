package com.anonymous.KDS

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  companion object {
    private const val TAG = "BootReceiver"
    private const val BOOT_DIAG_PREFS = "kds_boot_diagnostics"
  }

  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return

    if (
      action == Intent.ACTION_BOOT_COMPLETED ||
      action == Intent.ACTION_LOCKED_BOOT_COMPLETED ||
      action == Intent.ACTION_USER_UNLOCKED ||
      action == Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      val prefs = context.getSharedPreferences(BOOT_DIAG_PREFS, Context.MODE_PRIVATE)
      prefs.edit()
        .putString("lastBootAction", action)
        .putLong("lastBootReceivedAt", System.currentTimeMillis())
        .putBoolean("lastBootLaunchAttempted", true)
        .putBoolean("lastBootLaunchSucceeded", false)
        .putString("lastBootLaunchError", "")
        .apply()

      try {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
          putExtra("started_from_boot", true)
          putExtra("boot_action", action)
        }

        context.startActivity(launchIntent)
        prefs.edit()
          .putBoolean("lastBootLaunchSucceeded", true)
          .putString("lastBootLaunchError", "")
          .apply()
        Log.i(TAG, "App launch requested after boot: $action")
      } catch (e: Exception) {
        val errorMessage = e.message ?: e.javaClass.simpleName
        prefs.edit()
          .putBoolean("lastBootLaunchSucceeded", false)
          .putString("lastBootLaunchError", errorMessage)
          .apply()
        Log.e(TAG, "Failed to launch app on boot", e)
      }
    }
  }
}
