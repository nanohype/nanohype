package __JAVA_PKG__.service;

import __JAVA_PKG__.domain.ExampleEntity;
import __JAVA_PKG__.repository.ExampleRepository;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class ExampleService {

    private final ExampleRepository repo;

    public ExampleService(ExampleRepository repo) {
        this.repo = repo;
    }

    @Transactional(readOnly = true)
    public List<ExampleEntity> list() {
        return repo.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<ExampleEntity> find(Long id) {
        return repo.findById(id);
    }

    public ExampleEntity create(String name) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("name must not be blank");
        }
        return repo.save(new ExampleEntity(name));
    }

    public void delete(Long id) {
        repo.deleteById(id);
    }
}
