package com.example.app.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.app.ui.theme.AppBg
import com.example.app.ui.theme.BlueAccent
import com.example.app.ui.theme.Ink
import com.example.app.ui.theme.Muted
import com.example.app.ui.theme.Navy
import com.example.app.ui.theme.RedInk

@Composable
fun LoginScreen(vm: LoginViewModel = hiltViewModel()) {
    Box(
        Modifier.fillMaxSize().background(AppBg).padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            Modifier
                .fillMaxWidth()
                .background(Color.White, RoundedCornerShape(20.dp))
                .padding(28.dp),
        ) {
            // לוגו
            Box(
                Modifier.size(56.dp).background(Navy, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Text("B", color = BlueAccent, fontSize = 24.sp, fontWeight = FontWeight.Black)
            }
            Column(Modifier.padding(top = 20.dp)) {
                Text("כניסה למערכת", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
                Text("התחבר כדי לנהל את הסטטוסים שלך", color = Muted, fontSize = 13.sp)
            }

            OutlinedTextField(
                value = vm.email,
                onValueChange = { vm.email = it },
                label = { Text("אימייל") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(top = 20.dp),
            )
            OutlinedTextField(
                value = vm.password,
                onValueChange = { vm.password = it },
                label = { Text("סיסמה") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
            )

            vm.error?.let {
                Text(it, color = RedInk, fontSize = 13.sp, modifier = Modifier.padding(top = 12.dp))
            }

            Button(
                onClick = { vm.submit() },
                enabled = !vm.loading,
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Navy),
                modifier = Modifier.fillMaxWidth().height(48.dp).padding(top = 20.dp),
            ) {
                if (vm.loading) {
                    CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                } else {
                    Text("כניסה", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
