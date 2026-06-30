package com.example.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.app.ui.dashboard.DashboardScreen
import com.example.app.ui.login.LoginScreen
import com.example.app.ui.theme.AppBg
import com.example.app.ui.theme.Navy
import com.example.app.ui.upload.UploadScreen

@Composable
fun AppRoot(gate: GateViewModel = hiltViewModel()) {
    val loggedIn by gate.loggedIn.collectAsState()

    when (loggedIn) {
        null -> Box(Modifier.fillMaxSize().background(AppBg), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = Navy)
        }
        false -> LoginScreen()
        true -> MainNav()
    }
}

@Composable
private fun MainNav() {
    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = "dashboard") {
        composable("dashboard") {
            DashboardScreen(onUpload = { nav.navigate("upload") })
        }
        composable("upload") {
            UploadScreen(onDone = { nav.popBackStack() })
        }
    }
}
