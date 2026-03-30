package com.anonymous.KDS

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return

    if (
      action == Intent.ACTION_BOOT_COMPLETED ||
      action == Intent.ACTION_LOCKED_BOOT_COMPLETED
    ) {
      try {
        val launchIntent = Intent(context, MainActivity::class.java).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
          putExtra("started_from_boot", true)
        }

        context.startActivity(launchIntent)
        Log.i("BootReceiver", "App launched after boot: $action")
      } catch (e: Exception) {
        Log.e("BootReceiver", "Failed to launch app on boot", e)
      }
    }
  }
}
