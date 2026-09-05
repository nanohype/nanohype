package __JAVA_PKG__.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Names and versions the generated OpenAPI document that springdoc serves. */
@Configuration
public class OpenApiConfig {

  @Bean
  OpenAPI openApi() {
    return new OpenAPI()
        .info(new Info().title("__PROJECT_NAME__").description("__DESCRIPTION__").version("v1"));
  }
}
