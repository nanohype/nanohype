package __JAVA_PKG__.web;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(HealthController.class)
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
