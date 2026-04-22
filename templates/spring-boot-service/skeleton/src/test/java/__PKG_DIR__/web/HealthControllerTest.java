package __JAVA_PKG__.web;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import __JAVA_PKG__.config.SecurityConfig;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthController.class)
@Import(SecurityConfig.class)
class HealthControllerTest {

    @Autowired
    MockMvc mvc;

    @Test
    void helloReturnsServiceName() throws Exception {
        mvc.perform(get("/api/v1/hello").with(jwt()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.service").value("__ARTIFACT_ID__"));
    }
}
