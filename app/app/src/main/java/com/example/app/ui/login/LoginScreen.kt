package com.example.app.ui.login

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Mail
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.example.app.ui.theme.*

@Composable
fun LoginScreen(vm: LoginViewModel = hiltViewModel()) {
    var showPassword by remember { mutableStateOf(false) }
    val focus = LocalFocusManager.current

    Column(
        Modifier.fillMaxSize().background(WaSurface).navigationBarsPadding()
            .imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Spacer(Modifier.height(60.dp))
        Box(Modifier.size(76.dp).background(WaGreen, CircleShape), contentAlignment = Alignment.Center) {
            Text("B", color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Bold)
        }
        Text("BTB סטטוסים", color = Ink, fontSize = 27.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 22.dp))
        Text("כל הסטטוסים והקהל שלך במקום אחד", color = Muted, fontSize = 15.sp, modifier = Modifier.padding(top = 6.dp))

        Spacer(Modifier.height(44.dp))
        OutlinedTextField(
            value = vm.email, onValueChange = { vm.email = it },
            label = { Text("כתובת אימייל") }, leadingIcon = { Icon(Icons.Outlined.Mail, null) },
            singleLine = true, shape = RoundedCornerShape(14.dp),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            keyboardActions = KeyboardActions(onNext = { focus.moveFocus(FocusDirection.Down) }),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = vm.password, onValueChange = { vm.password = it },
            label = { Text("סיסמה") }, leadingIcon = { Icon(Icons.Outlined.Lock, null) },
            trailingIcon = {
                IconButton(onClick = { showPassword = !showPassword }) {
                    Icon(if (showPassword) Icons.Outlined.VisibilityOff else Icons.Outlined.Visibility, "הצגת סיסמה")
                }
            },
            singleLine = true, shape = RoundedCornerShape(14.dp),
            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { focus.clearFocus(); vm.submit() }),
            modifier = Modifier.fillMaxWidth().padding(top = 14.dp),
        )
        vm.error?.let {
            Text(it, color = RedInk, fontSize = 13.sp, modifier = Modifier.fillMaxWidth().padding(top = 10.dp))
        }
        Button(
            onClick = { focus.clearFocus(); vm.submit() }, enabled = !vm.loading,
            shape = RoundedCornerShape(50),
            modifier = Modifier.fillMaxWidth().padding(top = 24.dp).height(54.dp),
        ) {
            if (vm.loading) CircularProgressIndicator(color = Color.White, strokeWidth = 2.dp, modifier = Modifier.size(22.dp))
            else Text("כניסה", fontSize = 16.sp, fontWeight = FontWeight.Bold)
        }
        Text("החשבון שלך מאובטח ומקושר ל־WhatsApp", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(vertical = 28.dp))
    }
}
