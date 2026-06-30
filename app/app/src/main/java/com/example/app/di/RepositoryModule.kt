package com.example.app.di

import com.example.app.data.repository.AuthRepositoryImpl
import com.example.app.data.repository.BtbRepositoryImpl
import com.example.app.domain.repository.AuthRepository
import com.example.app.domain.repository.BtbRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds @Singleton
    abstract fun bindAuthRepository(impl: AuthRepositoryImpl): AuthRepository

    @Binds @Singleton
    abstract fun bindBtbRepository(impl: BtbRepositoryImpl): BtbRepository
}
