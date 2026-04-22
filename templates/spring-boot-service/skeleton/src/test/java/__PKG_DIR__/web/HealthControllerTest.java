package __JAVA_PKG__.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.security.oauth2.server.resource.autoconfigure.servlet.OAuth2ResourceServerAutoConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Slice test for the controller layer only. Security filters are disabled
 * (addFilters=false) and the OAuth2 resource server auto-config is excluded
 * because a web slice doesn't supply the HttpSecurity bean that auto-config
 * requires. Authentication flow is covered by the full integration test.
 */
@WebMvcTest(controllers = HealthController.class,
    excludeAutoConfiguration = OAuth2ResourceServerAutoConfiguration.class)
@AutoConfigureMockMvc(addFilters = false)
class HealthControllerTest {

    @Autowired
    MockMvc mvc;

    @Test
    void helloReturnsServiceName() throws Exception {
        mvc.perform(get("/api/v1/hello"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("__ARTIFACT_ID__"));
    }
}
