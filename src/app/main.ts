import { importProvidersFrom, provideZonelessChangeDetection } from "@angular/core"
import { provideHttpClient, withFetch } from "@angular/common/http"
import { bootstrapApplication } from "@angular/platform-browser"
import { provideAnimations } from "@angular/platform-browser/animations"
import { AppRoutingModule } from "@app/app-routing.module"
import { AppComponent } from "@app/app.component"
import { migrateUserData } from "@store/utils/migrate-user-data"

migrateUserData()

bootstrapApplication(AppComponent, {
  providers: [importProvidersFrom(AppRoutingModule), provideAnimations(), provideZonelessChangeDetection(), provideHttpClient(withFetch())]
}).catch(err => console.error(err))
