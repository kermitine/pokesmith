import { Component, inject } from "@angular/core"
import { RouterOutlet } from "@angular/router"
import { MatIconRegistry } from "@angular/material/icon"
import { DomSanitizer } from "@angular/platform-browser"
import { ThemeService } from "@app/services/theme.service"

@Component({ selector: "app-root", imports: [RouterOutlet], template: "<router-outlet />" })
export class AppComponent {
  private themeService = inject(ThemeService)
  constructor() {
    inject(MatIconRegistry).addSvgIcon("pokeball", inject(DomSanitizer).bypassSecurityTrustResourceUrl("assets/icons/pokeball.svg"))
  }
}
